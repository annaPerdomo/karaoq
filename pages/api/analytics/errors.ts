import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { resolveTimezone } from "../../../lib/analyticsStats";
import { getClientErrorsCollection } from "../../../lib/mongodb";

const WINDOW_DAYS = 30;
const MAX_GROUPS = 50;
const MAX_RECENT = 50;
const MAX_ROOMS_PER_GROUP = 12;

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

  // Viewer's zone, matching /api/analytics/data: the client fills the sparkline
  // from local day keys, so UTC buckets would shift every error a column over.
  const tz = resolveTimezone(req.query.tz);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const errors = await getClientErrorsCollection();

    const [groups, recent, last24h, last7d, total, roomsAffected] =
      await Promise.all([
        errors
          .aggregate([
            { $match: { timestamp: { $gte: windowStart } } },
            // Chronological so $last picks the freshest stack/page sample.
            { $sort: { timestamp: 1 } },
            {
              $group: {
                _id: {
                  message: "$message",
                  source: "$source",
                  day: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$timestamp",
                      timezone: tz,
                    },
                  },
                },
                count: { $sum: 1 },
                rooms: { $addToSet: "$roomId" },
                firstSeen: { $min: "$timestamp" },
                lastSeen: { $max: "$timestamp" },
                sampleStack: { $last: "$stack" },
                samplePage: { $last: "$page" },
              },
            },
            { $sort: { "_id.day": 1 } },
            {
              $group: {
                _id: { message: "$_id.message", source: "$_id.source" },
                count: { $sum: "$count" },
                byDay: { $push: { _id: "$_id.day", count: "$count" } },
                roomSets: { $push: "$rooms" },
                firstSeen: { $min: "$firstSeen" },
                lastSeen: { $max: "$lastSeen" },
                sampleStack: { $last: "$sampleStack" },
                samplePage: { $last: "$samplePage" },
              },
            },
            {
              $project: {
                _id: 0,
                message: "$_id.message",
                source: "$_id.source",
                count: 1,
                byDay: 1,
                firstSeen: 1,
                lastSeen: 1,
                sampleStack: 1,
                samplePage: 1,
                // "" is an error outside any room; it isn't a room.
                rooms: {
                  $filter: {
                    input: {
                      $setUnion: [
                        {
                          $reduce: {
                            input: "$roomSets",
                            initialValue: [],
                            in: { $setUnion: ["$$value", "$$this"] },
                          },
                        },
                      ],
                    },
                    as: "r",
                    cond: { $ne: ["$$r", ""] },
                  },
                },
              },
            },
            {
              $addFields: {
                roomCount: { $size: "$rooms" },
                rooms: { $slice: ["$rooms", MAX_ROOMS_PER_GROUP] },
              },
            },
            { $sort: { count: -1, lastSeen: -1 } },
            { $limit: MAX_GROUPS },
          ])
          .toArray(),

        errors
          .find({ timestamp: { $gte: windowStart } })
          .sort({ timestamp: -1 })
          .limit(MAX_RECENT)
          .project({
            _id: 0,
            message: 1,
            source: 1,
            page: 1,
            roomId: 1,
            country: 1,
            timestamp: 1,
          })
          .toArray(),

        errors.countDocuments({ timestamp: { $gte: dayAgo } }),
        errors.countDocuments({ timestamp: { $gte: weekAgo } }),
        errors.countDocuments({ timestamp: { $gte: windowStart } }),
        errors
          .distinct("roomId", {
            timestamp: { $gte: windowStart },
            roomId: { $ne: "" },
          })
          .then((ids) => ids.length),
      ]);

    res.status(200).json({
      windowDays: WINDOW_DAYS,
      totals: { last24h, last7d, total, roomsAffected },
      groups,
      recent,
    });
  } catch (e) {
    console.error("Errors query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
