import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { ADMIN_LIVE_WINDOW_MS } from "../../../lib/liveWindows";
import { getAnalyticsDb } from "../../../lib/mongodb";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_QUERY_LENGTH = 24;

/** Count of one event type out of the grouped-counts lookup below. */
function countOfType(type: string) {
  return {
    $ifNull: [
      {
        $arrayElemAt: [
          {
            $map: {
              input: {
                $filter: {
                  input: "$eventCounts",
                  as: "c",
                  cond: { $eq: ["$$c._id", type] },
                },
              },
              as: "c",
              in: "$$c.n",
            },
          },
          0,
        ],
      },
      0,
    ],
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

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const skip = Math.max(0, parseInt(req.query.skip as string, 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT)
  );
  const q =
    typeof req.query.q === "string"
      ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH)
      : "";
  const liveOnly = req.query.live === "1";

  const createdMatch: Record<string, unknown> = { type: "room_created" };
  if (q) {
    // Prefix match on the room code; escaped so "." can't widen the search.
    createdMatch.roomId = {
      $regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      $options: "i",
    };
  }

  try {
    const db = await getAnalyticsDb();
    const events = db.collection("analytics_events");

    // Rides the TTL index already on rooms.lastActivity, and fetches only the
    // live rooms rather than the collection.
    const liveRoomIds: Promise<string[]> = db
      .collection("rooms")
      .distinct("id", {
        lastActivity: { $gte: new Date(Date.now() - ADMIN_LIVE_WINDOW_MS) },
      });

    // Narrowing roomId rather than filtering after the $limit, so paging still
    // walks the filtered set instead of thinning out whole pages.
    const liveMatch = (ids: string[]) => ({
      ...createdMatch,
      roomId: {
        ...((createdMatch.roomId as Record<string, unknown>) ?? {}),
        $in: ids,
      },
    });

    // Awaited only when the filter is on: the default list doesn't depend on
    // this, so it goes out in parallel rather than a round trip behind it.
    const match = liveOnly ? liveMatch(await liveRoomIds) : createdMatch;

    // Not narrowed by `q`: a search matching nothing live must not blank the
    // badge. Counts events, not ids, so unsearched it agrees exactly with the
    // rows the filter shows — a room with two room_created docs is two rows.
    const liveCountPromise = liveRoomIds.then((ids) =>
      events.countDocuments({ type: "room_created", roomId: { $in: ids } })
    );

    const roomsPromise = events
      .aggregate([
        { $match: match },
        { $sort: { timestamp: -1 } },
        { $skip: skip },
        { $limit: limit + 1 },
        {
          // Every per-room event tally in one indexed lookup ({roomId, type})
          // rather than one lookup per stat. Duets ride on the song_added group.
          $lookup: {
            from: "analytics_events",
            let: { rid: "$roomId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$roomId", "$$rid"] },
                  type: {
                    $in: [
                      "song_added",
                      "reaction_sent",
                      "song_suggested",
                      // All three, because the dossier's boards section lists
                      // all three — the card's number has to be the same number.
                      "singwithme_posted",
                      "singwithme_joined",
                      "singwithme_queued",
                      "search_performed",
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: "$type",
                  n: { $sum: 1 },
                  duets: {
                    $sum: { $cond: [{ $gte: ["$singers", 2] }, 1, 0] },
                  },
                  // Only song_added carries a suggestionKey, so this sums to the
                  // room's picks however the groups fall.
                  ideas: {
                    $sum: { $cond: [{ $ifNull: ["$suggestionKey", false] }, 1, 0] },
                  },
                },
              },
            ],
            as: "eventCounts",
          },
        },
        {
          // Non-display session docs only, for the real head count. Grouped by locale rather than
          // counted so the head count and the language mix come from one lookup, not two.
          $lookup: {
            from: "analytics_sessions",
            let: { rid: "$roomId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$roomId", "$$rid"] },
                      { $ne: ["$role", "display"] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [
                      { $eq: [{ $type: "$locale" }, "string"] },
                      "$locale",
                      null,
                    ],
                  },
                  people: { $sum: 1 },
                },
              },
            ],
            as: "participantLocales",
          },
        },
        {
          // Newest-first + limit 1 keeps this a single index hit per room rather than a full scan.
          $lookup: {
            from: "analytics_events",
            let: { rid: "$roomId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$roomId", "$$rid"] },
                      { $eq: ["$type", "fair_mode_toggled"] },
                    ],
                  },
                },
              },
              { $sort: { timestamp: -1 } },
              { $limit: 1 },
              { $project: { _id: 0, fairMode: 1 } },
            ],
            as: "lastFairToggle",
          },
        },
        {
          // Gone once the 30-day TTL reaps the room, which reads as not live —
          // right. Projected down because a room doc carries its whole queue.
          $lookup: {
            from: "rooms",
            let: { rid: "$roomId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$id", "$$rid"] } } },
              { $project: { _id: 0, lastActivity: 1 } },
            ],
            as: "roomDoc",
          },
        },
        {
          $lookup: {
            from: "client_errors",
            let: { rid: "$roomId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$roomId", "$$rid"] } } },
              { $count: "total" },
            ],
            as: "errorCount",
          },
        },
        {
          $project: {
            _id: 0,
            roomId: 1,
            timestamp: 1,
            country: 1,
            city: 1,
            songs: countOfType("song_added"),
            cheers: countOfType("reaction_sent"),
            requests: countOfType("song_suggested"),
            singWithMe: {
              $add: [
                countOfType("singwithme_posted"),
                countOfType("singwithme_joined"),
                countOfType("singwithme_queued"),
              ],
            },
            searches: countOfType("search_performed"),
            duets: { $sum: "$eventCounts.duets" },
            ideas: { $sum: "$eventCounts.ideas" },
            errors: {
              $ifNull: [{ $arrayElemAt: ["$errorCount.total", 0] }, 0],
            },
            participants: { $sum: "$participantLocales.people" },
            lastActivity: {
              $ifNull: [{ $arrayElemAt: ["$roomDoc.lastActivity", 0] }, null],
            },
            // Last toggle wins, else the created value; null on rooms predating both.
            fairMode: {
              $ifNull: [
                { $arrayElemAt: ["$lastFairToggle.fairMode", 0] },
                { $ifNull: ["$fairMode", null] },
              ],
            },
            fairToggled: { $gt: [{ $size: "$lastFairToggle" }, 0] },
            // Rides on room_created itself; null before it was recorded — which is most rooms, so
            // the language a room is *shown* as is the participants' mix below, not this.
            locale: { $ifNull: ["$locale", null] },
            // What people actually ran the room in. Unsorted; the client orders it.
            localeMix: {
              $map: {
                input: {
                  $filter: {
                    input: "$participantLocales",
                    as: "p",
                    cond: { $ne: ["$$p._id", null] },
                  },
                },
                as: "p",
                in: { locale: "$$p._id", people: "$$p.people" },
              },
            },
          },
        },
      ])
      .toArray();

    // Awaited together so neither can be left dangling as an unhandled
    // rejection when the other fails.
    const [docs, liveCount] = await Promise.all([
      roomsPromise,
      liveCountPromise,
    ]);

    const hasMore = docs.length > limit;
    res.status(200).json({ rooms: docs.slice(0, limit), hasMore, liveCount });
  } catch (e) {
    console.error("Rooms query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
