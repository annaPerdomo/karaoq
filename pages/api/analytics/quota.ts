import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import {
  type DaySpend,
  SEARCH_DAY_QUOTA,
  dayKeyBefore,
  ledgerDay,
  searchesLeft,
  spentRecent,
} from "../../../lib/corpusBudget";
import { getAnalyticsDb } from "../../../lib/mongodb";
import { quotaResetsAt } from "../../../lib/pacificTime";
import type { AnalyticsEvent } from "../../../lib/analytics";
import type {
  DayBilledWire,
  DayRoomsWire,
  DaySourcesWire,
  DaySpendWire,
  QuotaLedgerData,
  RoomSpendWire,
  SearchSource,
} from "../../../components/admin/types";

const LEDGER_DAYS = 7;
/** Within LEDGER_KEEP_DAYS, and search_run events live 90 days. */
const HISTORY_DAYS = 30;
const MAX_ROOMS_PER_DAY = 50;

const SOURCES: SearchSource[] = ["miss", "fresh", "coalesced", "stale", "corpus"];

function emptySources(): Record<SearchSource, number> {
  return { miss: 0, fresh: 0, coalesced: 0, stale: 0, corpus: 0 };
}

/** Only a cache miss bills YouTube (pages/api/search records spend on that path
 *  alone). Rows are re-bucketed to Pacific days; the fetch's extra day covers the
 *  UTC offset. */
async function searchesByDay(
  now: number
): Promise<{ roomsByDay: DayRoomsWire[]; sourcesByDay: DaySourcesWire[] }> {
  const today = ledgerDay(now);
  const days: string[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) days.push(dayKeyBefore(today, i));

  const db = await getAnalyticsDb();
  const since = new Date(now - (HISTORY_DAYS + 1) * 24 * 60 * 60 * 1000);
  const rows = await db
    .collection<AnalyticsEvent>("analytics_events")
    .find(
      { type: "search_run", timestamp: { $gte: since } },
      { projection: { _id: 0, roomId: 1, timestamp: 1, searchCache: 1, country: 1, city: 1 } }
    )
    .toArray();

  const roomsBy = new Map<string, Map<string, RoomSpendWire>>(
    days.map((day) => [day, new Map()])
  );
  const billedBy = new Map<string, number>(days.map((day) => [day, 0]));
  const sourcesBy = new Map<string, Record<SearchSource, number>>(
    days.map((day) => [day, emptySources()])
  );
  for (const row of rows) {
    const at = new Date(row.timestamp);
    const day = ledgerDay(at.getTime());
    const sources = sourcesBy.get(day);
    if (!sources) continue;
    const source = row.searchCache;
    if (source && SOURCES.includes(source)) sources[source] += 1;
    if (source !== "miss") continue;
    billedBy.set(day, billedBy.get(day)! + 1);
    if (!row.roomId) continue;

    const rooms = roomsBy.get(day)!;
    const iso = at.toISOString();
    const room = rooms.get(row.roomId) ?? { roomId: row.roomId, searches: 0, lastAt: iso };
    room.searches += 1;
    if (iso >= room.lastAt) {
      room.lastAt = iso;
      if (row.country) {
        room.country = row.country;
        if (row.city) room.city = row.city;
      }
    }
    rooms.set(row.roomId, room);
  }
  return {
    roomsByDay: days.map((day) => {
      const rooms = Array.from(roomsBy.get(day)!.values());
      return {
        day,
        searches: billedBy.get(day)!,
        roomCount: rooms.length,
        rooms: rooms
          .sort((a, b) => b.searches - a.searches || b.lastAt.localeCompare(a.lastAt))
          .slice(0, MAX_ROOMS_PER_DAY),
      };
    }),
    sourcesByDay: days.map((day) => ({ day, sources: sourcesBy.get(day)! })),
  };
}

/** search_run events are fire-and-forget, so they only stand in for days the
 *  ledger no longer holds. */
function billedDay(spend: DaySpend, rooms: DayRoomsWire | undefined): DayBilledWire {
  if (!spend.recorded) {
    return {
      day: spend.day,
      recorded: false,
      out: false,
      rooms: rooms?.searches ?? 0,
      nightly: 0,
      mopUp: 0,
      unlogged: 0,
    };
  }
  const unlogged = spend.unloggedSearches ?? 0;
  const mopUp = Math.min(
    spend.cronSearches,
    spend.mopUpSearches ?? spend.mopUp?.searched ?? 0
  );
  return {
    day: spend.day,
    recorded: true,
    // In units, as the cron and room search read it: a spent day stops short
    // of 100 searches, since each also bills its enrichment lookup.
    out: searchesLeft(spend, SEARCH_DAY_QUOTA) === 0,
    rooms: Math.max(0, spend.searches - spend.cronSearches - unlogged),
    nightly: spend.cronSearches - mopUp,
    mopUp,
    unlogged,
    mopUpSongs: spend.mopUp?.songs,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  try {
    const now = Date.now();
    const [spent, searches] = await Promise.all([
      spentRecent(now, HISTORY_DAYS),
      searchesByDay(now),
    ]);
    const days: DaySpendWire[] = spent.slice(-LEDGER_DAYS).map((day) => ({
      ...day,
      mopUp: day.mopUp
        ? { ...day.mopUp, songs: undefined, at: day.mopUp.at.toISOString() }
        : undefined,
    }));
    const data: QuotaLedgerData = {
      quota: SEARCH_DAY_QUOTA,
      today: ledgerDay(now),
      resetsAt: quotaResetsAt(new Date(now)),
      days,
      ...searches,
      billedByDay: spent.map((day, i) => billedDay(day, searches.roomsByDay[i])),
    };
    res.status(200).json(data);
  } catch (e) {
    console.error("Quota ledger read failed:", e);
    res.status(500).json({ code: 500, message: "Failed to read the quota ledger." });
  }
}
