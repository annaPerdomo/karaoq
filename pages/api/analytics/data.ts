import { NextApiRequest, NextApiResponse } from "next";
import { CHOSEN_LOCALE_SOURCES } from "../../../lib/i18n/activeLocale";
import { getAnalyticsDb } from "../../../lib/mongodb";
import {
  buildSongsHistogram,
  median,
  resolveTimezone,
  summarizeFunnel,
  type FunnelRoom,
} from "../../../lib/analyticsStats";

const FUNNEL_WINDOW_DAYS = 30;

// Cap on a session's counted length: anything above it is the legacy revisit artifact
// (firstSeen anchored days before lastSeen) on pre-fix docs.
const MAX_SESSION_MINUTES = 360;

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

  const tz = resolveTimezone(req.query.tz);

  try {
    const db = await getAnalyticsDb();
    const events = db.collection("analytics_events");
    const sessions = db.collection("analytics_sessions");

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayKey = { format: "%Y-%m-%d", date: "$timestamp", timezone: tz };

    const [
      totalRooms,
      roomsThisWeek,
      totalSongs,
      totalReactions,
      uniqueUsers,
      roomsByDay,
      songsByDay,
      countryCounts,
      cityCounts,
      hourlyActivity,
      dayOfWeekSongs,
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
      funnelRooms,
      reactionsByEmoji,
      hostRetention,
      singWithMePosted,
      singWithMeJoined,
      singWithMeQueued,
      singWithMeByDay,
      boardSuggested,
      boardClaimed,
      boardSuggestedByDay,
      addsByVia,
      displaySaves,
      displayRoomsCustomized,
      displayFieldCounts,
      displayThemeCounts,
      hostSaves,
      hostRoomsCustomized,
      hostFieldCounts,
      hostThemeCounts,
      duetAdds,
      singerTrackedAdds,
      singerSizeCounts,
      fairRoomStats,
      sessionsByLocale,
      roomsCreatedByLocale,
      localeByCountry,
      uniqueLocaleRooms,
      nonEnglishLocaleRooms,
    ] = await Promise.all([
      events.countDocuments({ type: "room_created" }),

      events.countDocuments({ type: "room_created", timestamp: { $gte: weekAgo } }),

      events.countDocuments({ type: "song_added" }),

      events.countDocuments({ type: "reaction_sent" }),

      events.distinct("userName", { type: "song_added" }).then((names) => names.length),

      events
        .aggregate([
          { $match: { type: "room_created", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "song_added", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { country: { $exists: true, $ne: null } } },
          { $group: { _id: "$country", rooms: { $addToSet: "$roomId" } } },
          { $project: { count: { $size: "$rooms" } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { city: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: { city: "$city", country: "$country", region: "$region" },
              rooms: { $addToSet: "$roomId" },
            },
          },
          { $project: { count: { $size: "$rooms" } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $hour: { date: "$timestamp", timezone: tz } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Day of week: 1=Sun … 7=Sat, viewer timezone.
      events
        .aggregate([
          { $match: { type: "song_added" } },
          {
            $group: {
              _id: { $dayOfWeek: { date: "$timestamp", timezone: tz } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

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

      events
        .aggregate([
          { $match: { type: "song_added", userName: { $exists: true } } },
          { $group: { _id: "$userName", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Durations exclude display (TV) sessions, which stay open all night.
      sessions
        .aggregate([
          {
            $project: {
              role: 1,
              durationMin: {
                $cond: [
                  { $ne: ["$role", "display"] },
                  {
                    $min: [
                      { $divide: [{ $subtract: ["$lastSeen", "$firstSeen"] }, 60000] },
                      MAX_SESSION_MINUTES,
                    ],
                  },
                  null,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: "$durationMin" },
              maxDuration: { $max: "$durationMin" },
              durations: { $push: "$durationMin" },
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

      events.countDocuments({ type: "qr_printed" }),

      events
        .aggregate([
          { $match: { type: "qr_printed", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      events.countDocuments({ type: "suggestion_used" }),

      events
        .aggregate([
          { $match: { type: "suggestion_used" } },
          { $group: { _id: "$suggestionSource", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "suggestion_used", sectionId: { $exists: true, $ne: null } } },
          { $group: { _id: "$sectionId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "suggestion_used", categoryId: { $exists: true, $ne: null } } },
          { $group: { _id: "$categoryId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      // Older events stored the artist in userName before songArtist existed, hence the $ifNull.
      events
        .aggregate([
          { $match: { type: "suggestion_used", suggestionSource: "song_pick", songTitle: { $exists: true } } },
          {
            $group: {
              _id: {
                title: "$songTitle",
                artist: { $ifNull: ["$songArtist", "$userName"] },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "suggestion_used", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: { $in: ["room_created", "search_performed", "song_added"] } } },
          {
            $group: {
              _id: "$roomId",
              createdAt: {
                $min: { $cond: [{ $eq: ["$type", "room_created"] }, "$timestamp", null] },
              },
              searches: {
                $sum: { $cond: [{ $eq: ["$type", "search_performed"] }, 1, 0] },
              },
              songs: {
                $sum: { $cond: [{ $eq: ["$type", "song_added"] }, 1, 0] },
              },
              firstSongAt: {
                $min: { $cond: [{ $eq: ["$type", "song_added"] }, "$timestamp", null] },
              },
            },
          },
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          {
            $project: {
              _id: 0,
              searches: 1,
              songs: 1,
              minutesToFirstSong: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$firstSongAt", null] },
                      { $gte: ["$firstSongAt", "$createdAt"] },
                    ],
                  },
                  { $divide: [{ $subtract: ["$firstSongAt", "$createdAt"] }, 60000] },
                  null,
                ],
              },
            },
          },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "reaction_sent", emoji: { $exists: true, $ne: null } } },
          { $group: { _id: "$emoji", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .toArray(),

      sessions
        .aggregate([
          { $match: { role: "host", clientId: { $type: "string" } } },
          { $group: { _id: "$clientId", rooms: { $addToSet: "$roomId" } } },
          { $project: { roomCount: { $size: "$rooms" } } },
          {
            $group: {
              _id: null,
              hosts: { $sum: 1 },
              repeatHosts: {
                $sum: { $cond: [{ $gte: ["$roomCount", 2] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),

      events.countDocuments({ type: "singwithme_posted" }),
      events.countDocuments({ type: "singwithme_joined" }),
      events.countDocuments({ type: "singwithme_queued" }),
      events
        .aggregate([
          { $match: { type: "singwithme_posted", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      events.countDocuments({ type: "song_suggested" }),
      events.countDocuments({ type: "suggestion_claimed" }),
      events
        .aggregate([
          { $match: { type: "song_suggested", timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: dayKey }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Events from before the via field are search adds, hence the $ifNull.
      events
        .aggregate([
          { $match: { type: "song_added" } },
          { $group: { _id: { $ifNull: ["$via", "search"] }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      events.countDocuments({ type: "display_config_saved" }),
      events
        .distinct("roomId", {
          type: "display_config_saved",
          "changedFields.0": { $exists: true },
        })
        .then((rooms) => rooms.length),
      events
        .aggregate([
          { $match: { type: "display_config_saved" } },
          { $unwind: "$changedFields" },
          { $group: { _id: { field: "$changedFields", room: "$roomId" } } },
          { $group: { _id: "$_id.field", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      events
        .aggregate([
          { $match: { type: "display_config_saved", "displayConfig.theme": { $exists: true } } },
          { $sort: { timestamp: -1 } },
          { $group: { _id: "$roomId", theme: { $first: "$displayConfig.theme" } } },
          { $group: { _id: "$theme", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      events.countDocuments({ type: "host_config_saved" }),
      events
        .distinct("roomId", {
          type: "host_config_saved",
          "changedFields.0": { $exists: true },
        })
        .then((rooms) => rooms.length),
      events
        .aggregate([
          { $match: { type: "host_config_saved" } },
          { $unwind: "$changedFields" },
          { $group: { _id: { field: "$changedFields", room: "$roomId" } } },
          { $group: { _id: "$_id.field", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      events
        .aggregate([
          { $match: { type: "host_config_saved", "hostConfig.theme": { $exists: true } } },
          { $sort: { timestamp: -1 } },
          { $group: { _id: "$roomId", theme: { $first: "$hostConfig.theme" } } },
          { $group: { _id: "$theme", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      // Duet rate is reported against adds that carry a singer count — events predating the field would read as solos.
      events.countDocuments({ type: "song_added", singers: { $gte: 2 } }),
      events.countDocuments({ type: "song_added", singers: { $type: "number" } }),
      events
        .aggregate([
          { $match: { type: "song_added", singers: { $gte: 2 } } },
          { $group: { _id: "$singers", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // room_created carries the opening fairMode, fair_mode_toggled every change; ascending sort +
      // $last per room gives the ending state — same "last toggle wins" rule as the rooms table.
      events
        .aggregate([
          {
            $match: {
              type: { $in: ["room_created", "fair_mode_toggled"] },
              fairMode: { $type: "bool" },
            },
          },
          { $sort: { timestamp: 1 } },
          {
            $group: {
              _id: "$roomId",
              ended: { $last: "$fairMode" },
              toggles: {
                $sum: { $cond: [{ $eq: ["$type", "fair_mode_toggled"] }, 1, 0] },
              },
            },
          },
          {
            $group: {
              _id: null,
              rooms: { $sum: 1 },
              endedOn: { $sum: { $cond: ["$ended", 1, 0] } },
              toggled: { $sum: { $cond: [{ $gt: ["$toggles", 0] }, 1, 0] } },
            },
          },
        ])
        .toArray(),

      // Ranked by unique rooms so one long night can't outweigh ten rooms.
      sessions
        .aggregate([
          // Displays are TVs, not people — same exclusion the room detail and participant counts apply.
          { $match: { locale: { $type: "string" }, role: { $ne: "display" } } },
          {
            $group: {
              _id: "$locale",
              sessions: { $sum: 1 },
              rooms: { $addToSet: "$roomId" },
              hosts: { $sum: { $cond: [{ $eq: ["$role", "host"] }, 1, 0] } },
              singers: { $sum: { $cond: [{ $eq: ["$role", "singer"] }, 1, 0] } },
              chosen: {
                $sum: {
                  $cond: [
                    { $in: ["$localeSource", CHOSEN_LOCALE_SOURCES] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          {
            $project: {
              sessions: 1,
              hosts: 1,
              singers: 1,
              chosen: 1,
              rooms: { $size: "$rooms" },
            },
          },
          { $sort: { rooms: -1, sessions: -1 } },
        ])
        .toArray(),

      // Covers rooms that never got a heartbeat's worth of use.
      events
        .aggregate([
          { $match: { type: "room_created", locale: { $type: "string" } } },
          { $group: { _id: "$locale", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      sessions
        .aggregate([
          {
            $match: {
              locale: { $type: "string" },
              country: { $type: "string" },
            },
          },
          {
            $group: {
              _id: { country: "$country", locale: "$locale" },
              rooms: { $addToSet: "$roomId" },
            },
          },
          { $project: { count: { $size: "$rooms" } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
        ])
        .toArray(),

      // Distinct rooms directly — summing the per-locale groups would count a mixed-language room once per locale.
      sessions
        .distinct("roomId", { locale: { $type: "string" }, role: { $ne: "display" } })
        .then((ids) => ids.length),

      sessions
        .distinct("roomId", {
          locale: { $type: "string", $ne: "en" },
          role: { $ne: "display" },
        })
        .then((ids) => ids.length),
    ]);

    const sessionStats = sessionData[0] || {
      avgDuration: 0,
      maxDuration: 0,
      durations: [],
      totalSessions: 0,
      hostSessions: 0,
      singerSessions: 0,
    };
    // Display sessions come through as nulls in the pushed array.
    const sessionDurations = ((sessionStats.durations || []) as (number | null)[])
      .filter((d): d is number => typeof d === "number" && d >= 0);

    const songStats = songsPerRoom[0] || {
      avgSongsPerRoom: 0,
      maxSongsPerRoom: 0,
      distribution: [],
    };

    const retention = hostRetention[0] || { hosts: 0, repeatHosts: 0 };

    const fairStats = fairRoomStats[0] || { rooms: 0, endedOn: 0, toggled: 0 };

    // en-CA formats as YYYY-MM-DD, matching the $dateToString keys above.
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const roomsToday =
      roomsByDay.find((d) => d._id === todayKey)?.count ?? 0;

    const funnel = summarizeFunnel(funnelRooms as FunnelRoom[]);

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
        medianSessionMinutes: median(sessionDurations) ?? 0,
        totalSessions: sessionStats.totalSessions,
        hostSessions: sessionStats.hostSessions,
        singerSessions: sessionStats.singerSessions,
        avgSongsPerRoom: Math.round((songStats.avgSongsPerRoom || 0) * 10) / 10,
        maxSongsPerRoom: songStats.maxSongsPerRoom || 0,
        totalQrPrints,
      },
      charts: {
        roomsByDay,
        songsByDay,
        hourlyActivity,
        qrPrintsByDay,
        dayOfWeekSongs,
      },
      geo: {
        countries: countryCounts,
        cities: cityCounts,
      },
      languages: {
        bySession: sessionsByLocale,
        roomsCreated: roomsCreatedByLocale,
        byCountry: localeByCountry,
        uniqueRooms: uniqueLocaleRooms,
        nonEnglishRooms: nonEnglishLocaleRooms,
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
      funnel: {
        windowDays: FUNNEL_WINDOW_DAYS,
        ...funnel,
      },
      social: {
        addsByVia,
        singWithMe: {
          posted: singWithMePosted,
          joined: singWithMeJoined,
          queued: singWithMeQueued,
          byDay: singWithMeByDay,
        },
        board: {
          suggested: boardSuggested,
          claimed: boardClaimed,
          byDay: boardSuggestedByDay,
        },
      },
      engagement: {
        songsPerRoomHistogram: buildSongsHistogram(
          (songStats.distribution || []) as number[],
          totalRooms
        ),
        reactionsByEmoji,
        hosts: retention.hosts,
        repeatHosts: retention.repeatHosts,
      },
      display: {
        saves: displaySaves,
        roomsCustomized: displayRoomsCustomized,
        changedFields: displayFieldCounts,
        themes: displayThemeCounts,
      },
      hostSurface: {
        saves: hostSaves,
        roomsCustomized: hostRoomsCustomized,
        changedFields: hostFieldCounts,
        themes: hostThemeCounts,
      },
      rotation: {
        duetAdds,
        trackedAdds: singerTrackedAdds,
        bySize: singerSizeCounts,
        fairRooms: fairStats.rooms,
        fairEndedOn: fairStats.endedOn,
        fairToggled: fairStats.toggled,
      },
      meta: {
        timezone: tz,
        generatedAt: now.toISOString(),
      },
    });
  } catch (e) {
    console.error("Analytics query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
