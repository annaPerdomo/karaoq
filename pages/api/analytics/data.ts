import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";

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

  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    const events = db.collection("analytics_events");
    const sessions = db.collection("analytics_sessions");

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all aggregations in parallel
    const [
      totalRooms,
      roomsToday,
      roomsThisWeek,
      totalSongs,
      totalReactions,
      uniqueUsers,
      roomsByDay,
      songsByDay,
      countryCounts,
      cityCounts,
      hourlyActivity,
      topSongs,
      topUsers,
      sessionData,
      songsPerRoom,
      userAgentData,
      totalQrPrints,
      qrPrintsByDay,
      suggestionTotal,
      suggestionBySource,
      suggestionBySection,
      suggestionByCategory,
      suggestionTopSongs,
      suggestionsByDay,
    ] = await Promise.all([
      // Total rooms created
      events.countDocuments({ type: "room_created" }),

      // Rooms created today
      events.countDocuments({ type: "room_created", timestamp: { $gte: todayStart } }),

      // Rooms created this week
      events.countDocuments({ type: "room_created", timestamp: { $gte: weekAgo } }),

      // Total songs added
      events.countDocuments({ type: "song_added" }),

      // Total reactions
      events.countDocuments({ type: "reaction_sent" }),

      // Unique userNames across song_added events
      events.distinct("userName", { type: "song_added" }).then((names) => names.length),

      // Rooms created per day (last 30 days)
      events
        .aggregate([
          { $match: { type: "room_created", timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Songs per day (last 30 days)
      events
        .aggregate([
          { $match: { type: "song_added", timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Top countries
      events
        .aggregate([
          { $match: { country: { $exists: true, $ne: null } } },
          { $group: { _id: "$country", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Top cities
      events
        .aggregate([
          { $match: { city: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: { city: "$city", country: "$country", region: "$region" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Activity by hour of day (UTC)
      events
        .aggregate([
          { $match: { timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $hour: "$timestamp" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Top songs (most queued)
      events
        .aggregate([
          { $match: { type: "song_added", songTitle: { $exists: true } } },
          {
            $group: {
              _id: { title: "$songTitle", videoId: "$videoId" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Top users (most songs added)
      events
        .aggregate([
          { $match: { type: "song_added", userName: { $exists: true } } },
          { $group: { _id: "$userName", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Session duration data
      sessions
        .aggregate([
          {
            $project: {
              roomId: 1,
              userName: 1,
              role: 1,
              country: 1,
              city: 1,
              durationMin: {
                $divide: [
                  { $subtract: ["$lastSeen", "$firstSeen"] },
                  60000,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: "$durationMin" },
              maxDuration: { $max: "$durationMin" },
              totalSessions: { $sum: 1 },
              hostSessions: {
                $sum: { $cond: [{ $eq: ["$role", "host"] }, 1, 0] },
              },
              singerSessions: {
                $sum: { $cond: [{ $eq: ["$role", "singer"] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),

      // Songs per room distribution
      events
        .aggregate([
          { $match: { type: "song_added" } },
          { $group: { _id: "$roomId", count: { $sum: 1 } } },
          {
            $group: {
              _id: null,
              avgSongsPerRoom: { $avg: "$count" },
              maxSongsPerRoom: { $max: "$count" },
              distribution: { $push: "$count" },
            },
          },
        ])
        .toArray(),

      // Device type breakdown (from user agent)
      sessions
        .aggregate([
          { $match: { userAgent: { $exists: true, $ne: null } } },
          {
            $project: {
              device: {
                $cond: {
                  if: {
                    $regexMatch: {
                      input: "$userAgent",
                      regex: /Mobile|Android|iPhone|iPad/i,
                    },
                  },
                  then: "Mobile",
                  else: "Desktop",
                },
              },
            },
          },
          { $group: { _id: "$device", count: { $sum: 1 } } },
        ])
        .toArray(),

      // Total QR prints
      events.countDocuments({ type: "qr_printed" }),

      // QR prints per day (last 30 days)
      events
        .aggregate([
          { $match: { type: "qr_printed", timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Total suggestion uses
      events.countDocuments({ type: "suggestion_used" }),

      // Suggestion uses by source (random / song_pick / genre_chip)
      events
        .aggregate([
          { $match: { type: "suggestion_used" } },
          { $group: { _id: "$suggestionSource", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      // Suggestion uses by section (genre / voice-type / spanish / kpop / japanese)
      events
        .aggregate([
          { $match: { type: "suggestion_used", sectionId: { $exists: true, $ne: null } } },
          { $group: { _id: "$sectionId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      // Suggestion uses by category
      events
        .aggregate([
          { $match: { type: "suggestion_used", categoryId: { $exists: true, $ne: null } } },
          { $group: { _id: "$categoryId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Top suggested songs clicked
      events
        .aggregate([
          { $match: { type: "suggestion_used", suggestionSource: "song_pick", songTitle: { $exists: true } } },
          {
            $group: {
              _id: { title: "$songTitle", artist: "$userName" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Suggestion uses per day (last 30 days)
      events
        .aggregate([
          { $match: { type: "suggestion_used", timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

    const sessionStats = sessionData[0] || {
      avgDuration: 0,
      maxDuration: 0,
      totalSessions: 0,
      hostSessions: 0,
      singerSessions: 0,
    };

    const songStats = songsPerRoom[0] || {
      avgSongsPerRoom: 0,
      maxSongsPerRoom: 0,
    };

    res.status(200).json({
      overview: {
        totalRooms,
        roomsToday,
        roomsThisWeek,
        totalSongs,
        totalReactions,
        uniqueUsers,
        avgSessionMinutes: Math.round((sessionStats.avgDuration || 0) * 10) / 10,
        maxSessionMinutes: Math.round((sessionStats.maxDuration || 0) * 10) / 10,
        totalSessions: sessionStats.totalSessions,
        hostSessions: sessionStats.hostSessions,
        singerSessions: sessionStats.singerSessions,
        avgSongsPerRoom: Math.round((songStats.avgSongsPerRoom || 0) * 10) / 10,
        maxSongsPerRoom: songStats.maxSongsPerRoom,
        totalQrPrints,
      },
      charts: {
        roomsByDay,
        songsByDay,
        hourlyActivity,
        qrPrintsByDay,
      },
      geo: {
        countries: countryCounts,
        cities: cityCounts,
      },
      rankings: {
        topSongs,
        topUsers,
      },
      devices: userAgentData,
      suggestions: {
        total: suggestionTotal,
        bySource: suggestionBySource,
        bySection: suggestionBySection,
        byCategory: suggestionByCategory,
        topSongs: suggestionTopSongs,
        byDay: suggestionsByDay,
      },
    });
  } catch (e) {
    console.error("Analytics query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
