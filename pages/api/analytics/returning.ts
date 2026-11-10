import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { getAnalyticsDb } from "../../../lib/mongodb";
import { loadHosts, summarizeCameBack, type CameBackRow } from "../../../lib/hostNights";
import {
  FEATURE_EVENT_TYPES,
  featuresUsed,
  type TypeTally,
} from "../../../lib/adminFeatures";

export interface ReturningHostRow extends Omit<CameBackRow, "firstRooms"> {
  country: string | null;
  city: string | null;
  firstFeatures: string[];
}

export interface ReturningData {
  windowDays: number;
  returning: number;
  firstTime: number;
  rows: ReturningHostRow[];
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

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  try {
    const db = await getAnalyticsDb();
    const events = db.collection("analytics_events");
    const summary = summarizeCameBack(await loadHosts(db), Date.now());

    const latestRooms = summary.rows.map((r) => r.roomId);
    const firstRooms = Array.from(new Set(summary.rows.flatMap((r) => r.firstRooms)));

    const [places, tallies] = await Promise.all([
      latestRooms.length
        ? events
            .find({ type: "room_created", roomId: { $in: latestRooms } })
            .project<{ roomId: string; country?: string; city?: string }>({
              _id: 0,
              roomId: 1,
              country: 1,
              city: 1,
            })
            .toArray()
        : [],
      firstRooms.length
        ? events
            .aggregate<{ _id: { roomId: string; type: string } } & TypeTally>([
              { $match: { roomId: { $in: firstRooms }, type: { $in: [...FEATURE_EVENT_TYPES] } } },
              {
                $group: {
                  _id: { roomId: "$roomId", type: "$type" },
                  n: { $sum: 1 },
                  duets: { $sum: { $cond: [{ $gte: ["$singers", 2] }, 1, 0] } },
                  ideas: { $sum: { $cond: [{ $ifNull: ["$suggestionKey", false] }, 1, 0] } },
                },
              },
            ])
            .toArray()
        : [],
    ]);

    const placeByRoom = new Map(places.map((p) => [p.roomId, p]));
    const talliesByRoom = new Map<string, Record<string, TypeTally>>();
    for (const { _id, ...tally } of tallies) {
      let byType = talliesByRoom.get(_id.roomId);
      if (!byType) talliesByRoom.set(_id.roomId, (byType = {}));
      byType[_id.type] = tally;
    }

    const rows: ReturningHostRow[] = summary.rows.map(({ firstRooms: rooms, ...row }) => {
      const merged: Record<string, TypeTally> = {};
      for (const roomId of rooms) {
        for (const [type, tally] of Object.entries(talliesByRoom.get(roomId) ?? {})) {
          const sum = merged[type] ?? (merged[type] = { n: 0, duets: 0, ideas: 0 });
          sum.n += tally.n;
          sum.duets = (sum.duets ?? 0) + (tally.duets ?? 0);
          sum.ideas = (sum.ideas ?? 0) + (tally.ideas ?? 0);
        }
      }
      const place = placeByRoom.get(row.roomId);
      return {
        ...row,
        country: place?.country ?? null,
        city: place?.city ?? null,
        firstFeatures: featuresUsed(merged),
      };
    });

    const body: ReturningData = { ...summary, rows };
    res.status(200).json(body);
  } catch (e) {
    console.error("Returning-hosts query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
