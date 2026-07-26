import { NextApiRequest, NextApiResponse } from "next";
import { getAnalyticsDb } from "../../../lib/mongodb";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const secret = req.headers["x-analytics-secret"] as string;
  if (!process.env.ANALYTICS_SECRET || secret !== process.env.ANALYTICS_SECRET) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const skip = Math.max(0, parseInt(req.query.skip as string, 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT)
  );

  try {
    const db = await getAnalyticsDb();
    const events = db.collection("analytics_events");

    const docs = await events
      .aggregate([
        { $match: { type: "room_created" } },
        { $sort: { timestamp: -1 } },
        { $skip: skip },
        { $limit: limit + 1 },
        {
          $lookup: {
            from: "analytics_events",
            let: { rid: "$roomId" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$roomId", "$$rid"] }, { $eq: ["$type", "song_added"] }] } } },
              { $count: "total" },
            ],
            as: "songCount",
          },
        },
        {
          // Non-display session docs only, for the real head count.
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
              { $count: "total" },
            ],
            as: "participantCount",
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
          $project: {
            _id: 0,
            roomId: 1,
            timestamp: 1,
            country: 1,
            city: 1,
            songs: { $ifNull: [{ $arrayElemAt: ["$songCount.total", 0] }, 0] },
            participants: { $ifNull: [{ $arrayElemAt: ["$participantCount.total", 0] }, 0] },
            // Last toggle wins, else the created value; null on rooms predating both.
            fairMode: {
              $ifNull: [
                { $arrayElemAt: ["$lastFairToggle.fairMode", 0] },
                { $ifNull: ["$fairMode", null] },
              ],
            },
            fairToggled: { $gt: [{ $size: "$lastFairToggle" }, 0] },
            // Rides on room_created itself; null before it was recorded.
            locale: { $ifNull: ["$locale", null] },
          },
        },
      ])
      .toArray();

    const hasMore = docs.length > limit;
    res.status(200).json({ rooms: docs.slice(0, limit), hasMore });
  } catch (e) {
    console.error("Rooms query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
