import type { Db } from "mongodb";
import {
  ADMIN_FEATURES,
  FEATURE_EVENT_TYPES,
  FEATURE_EXTRA_TYPES,
  type AdminFeature,
} from "./adminFeatures";
import type { Host } from "./hostNights";

export const FEATURES_WINDOWS = [7, 30, 90] as const;
export type FeaturesWindow = (typeof FEATURES_WINDOWS)[number];

export interface FeatureTallyRow {
  type: string;
  roomId: string;
  n: number;
  duets: number;
  ideas: number;
  /** song_added rows that carry a singer count at all. */
  tracked: number;
  found: number;
  first: Date | null;
  duetFirst: Date | null;
  ideaFirst: Date | null;
}

export interface FeatureStat {
  label: "Worked" | "Volume";
  value: string;
  sub: string;
}

export interface FeatureCardData {
  id: string;
  rooms: number;
  stat: FeatureStat;
  hosts: number;
  /** Of `hosts`, those with a night after the one they used it on. */
  hostsReturned: number;
}

export interface FeaturesStats {
  days: number;
  roomsSang: number;
  baseline: { hosts: number; returned: number };
  features: FeatureCardData[];
}

export async function loadFeatureTallies(db: Db, since: Date): Promise<FeatureTallyRow[]> {
  const rows = await db
    .collection("analytics_events")
    .aggregate<Omit<FeatureTallyRow, "type" | "roomId"> & { _id: { type: string; roomId: string } }>([
      {
        $match: {
          type: { $in: [...FEATURE_EVENT_TYPES, ...FEATURE_EXTRA_TYPES] },
          timestamp: { $gte: since },
        },
      },
      {
        $group: {
          _id: { type: "$type", roomId: "$roomId" },
          n: { $sum: 1 },
          duets: { $sum: { $cond: [{ $gte: ["$singers", 2] }, 1, 0] } },
          ideas: { $sum: { $cond: [{ $ifNull: ["$suggestionKey", false] }, 1, 0] } },
          tracked: { $sum: { $cond: [{ $ifNull: ["$singers", false] }, 1, 0] } },
          found: { $sum: { $cond: [{ $eq: ["$found", true] }, 1, 0] } },
          first: { $min: "$timestamp" },
          // $min skips nulls, so these are the first matching event or null.
          duetFirst: { $min: { $cond: [{ $gte: ["$singers", 2] }, "$timestamp", null] } },
          ideaFirst: {
            $min: { $cond: [{ $ifNull: ["$suggestionKey", false] }, "$timestamp", null] },
          },
        },
      },
    ])
    .toArray();
  return rows.map(({ _id, ...rest }) => ({ type: _id.type, roomId: _id.roomId, ...rest }));
}

const SMALL_SAMPLE = 20;

function rate(part: number, whole: number, sub: string): FeatureStat {
  const capped = Math.min(part, whole);
  return {
    label: "Worked",
    value: whole < SMALL_SAMPLE ? `${capped} of ${whole}` : `${Math.round((capped / whole) * 100)}%`,
    sub: whole < SMALL_SAMPLE ? sub : `${capped} of ${whole} ${sub}`,
  };
}

function volume(n: number, sub: string): FeatureStat {
  return { label: "Volume", value: String(n), sub };
}

const VOLUME_SUB: Record<string, string> = {
  cheers: "cheers sent",
  customize: "layout saves",
  fair: "toggles",
  autoAdvance: "changes",
  screenHelp: "opens",
  tvPair: "pairings",
  qrPrint: "prints",
  wrapUp: "times set",
  songLimit: "limits set",
  postpone: "songs moved back",
};

type Tally = (type: string, field?: keyof FeatureTallyRow) => number;

function featureStat(feature: AdminFeature, total: Tally, rooms: Tally): FeatureStat {
  const used = feature.types.reduce((sum, type) => sum + total(type), 0);
  switch (feature.id) {
    case "musicVideo": {
      const lookups = total("original_video_resolved");
      return lookups > 0
        ? rate(total("original_video_resolved", "found"), lookups, "songs had a video")
        : volume(total("music_video_screen_opened"), "screen opens");
    }
    case "ideas": {
      // By room, not by tap: suggestion_used also counts genre-chip browsing.
      const browsed = rooms("suggestion_used");
      return browsed > 0
        ? rate(rooms("song_added", "ideas"), browsed, "rooms that browsed ideas queued one")
        : volume(total("song_added", "ideas"), "songs from ideas");
    }
    case "boards": {
      const requests = total("song_suggested");
      if (requests > 0) return rate(total("suggestion_claimed"), requests, "requests claimed");
      const posts = total("singwithme_posted");
      return posts > 0
        ? rate(total("singwithme_queued"), posts, "sing-together posts queued")
        : volume(used, "board actions");
    }
    case "swap": {
      const opens = total("karaoke_swap_opened");
      const swaps = total("karaoke_video_swapped");
      return opens > 0 ? rate(swaps, opens, "opens ended in a swap") : volume(swaps, "swaps");
    }
    case "branding": {
      const uploads = total("logo_uploaded");
      const tries = uploads + total("logo_upload_rejected");
      return tries > 0 ? rate(uploads, tries, "logo uploads accepted") : volume(used, "brand saves");
    }
    case "duets": {
      const tracked = total("song_added", "tracked");
      const duets = total("song_added", "duets");
      return tracked > 0
        ? { label: "Volume", value: String(duets), sub: `of ${tracked} songs added` }
        : volume(duets, "multi-singer adds");
    }
    default:
      return volume(used, VOLUME_SUB[feature.id] ?? "events");
  }
}

function nightIndexAt(host: Host, at: number): number {
  let index = -1;
  for (let i = 0; i < host.nights.length; i++) {
    if (host.nights[i].start <= at) index = i;
  }
  return index;
}

export function summarizeFeatures(
  rows: FeatureTallyRow[],
  hosts: Host[],
  since: number,
  days: number
): FeaturesStats {
  const byType = new Map<string, FeatureTallyRow[]>();
  for (const row of rows) {
    const list = byType.get(row.type);
    if (list) list.push(row);
    else byType.set(row.type, [row]);
  }
  const total = (type: string, field: keyof FeatureTallyRow = "n") =>
    (byType.get(type) ?? []).reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

  const rooms: Tally = (type, field = "n") =>
    (byType.get(type) ?? []).filter((row) => (Number(row[field]) || 0) > 0).length;

  const sang = new Set((byType.get("song_added") ?? []).map((r) => r.roomId));
  const roomsSang = sang.size;

  let baselineHosts = 0;
  let baselineReturned = 0;
  for (const host of hosts) {
    const first = host.nights.findIndex((n) => n.start >= since);
    if (first === -1) continue;
    baselineHosts += 1;
    if (first < host.nights.length - 1) baselineReturned += 1;
  }

  const features = ADMIN_FEATURES.map((feature): FeatureCardData => {
    const firstUse = new Map<string, number>();
    for (const type of feature.types) {
      for (const row of byType.get(type) ?? []) {
        const at =
          feature.slice === "duets" ? row.duetFirst : feature.slice === "ideas" ? row.ideaFirst : row.first;
        if (!at) continue;
        const stamp = new Date(at).getTime();
        const known = firstUse.get(row.roomId);
        if (known === undefined || stamp < known) firstUse.set(row.roomId, stamp);
      }
    }

    let featureHosts = 0;
    let returned = 0;
    for (const host of hosts) {
      let usedAt = Infinity;
      for (const night of host.nights) {
        for (const room of night.rooms) {
          const at = firstUse.get(room);
          if (at !== undefined && at < usedAt) usedAt = at;
        }
      }
      if (usedAt === Infinity) continue;
      featureHosts += 1;
      // Used before any song was queued: count from their first night.
      const usedNight = Math.max(0, nightIndexAt(host, usedAt));
      if (usedNight < host.nights.length - 1) returned += 1;
    }

    return {
      id: feature.id,
      // Only rooms that sang, or "used" can exceed the total it is shown against.
      rooms: Array.from(firstUse.keys()).filter((roomId) => sang.has(roomId)).length,
      stat: featureStat(feature, total, rooms),
      hosts: featureHosts,
      hostsReturned: returned,
    };
  });

  return {
    days,
    roomsSang,
    baseline: { hosts: baselineHosts, returned: baselineReturned },
    features,
  };
}
