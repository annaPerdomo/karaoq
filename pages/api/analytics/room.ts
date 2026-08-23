import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import {
  getAnalyticsDb,
  getClientErrorsCollection,
  getYoutubeSongDataCollection,
} from "../../../lib/mongodb";
import type { AnalyticsEvent } from "../../../lib/analytics";
import { CHOSEN_LOCALE_SOURCES } from "../../../lib/i18n/activeLocale";
import {
  normalizeDisplayConfig,
  normalizeHostConfig,
  type DisplayConfig,
  type HostConfig,
} from "../types";

const MAX_ERROR_ROWS = 200;

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  roomId: string
) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const db = await getAnalyticsDb();

  // Exclude displays (TVs, not people) — same rule as the rooms-list head count.
  const sessionsPromise = db
    .collection("analytics_sessions")
    .find({ roomId, role: { $ne: "display" } })
    .sort({ firstSeen: 1 })
    .limit(500)
    .toArray();

  // Fetched NEWEST-first so the 2000-doc cap trims the start of the night ("last save wins" and the
  // fair-mode end state depend on the tail), then reversed to chronological order.
  const eventsPromise = db
    .collection<AnalyticsEvent>("analytics_events")
    .find({
      roomId,
      type: {
        $in: [
          "song_added",
          "song_suggested",
          "singwithme_posted",
          "singwithme_joined",
          "singwithme_queued",
          "reaction_sent",
          "search_performed",
          // Our own catalog data, so no retention window strips the titles.
          "suggestion_used",
          // Attributed to a room since the client began sending its code with
          // the search request; older failures carry roomId "" and never match.
          "search_failed",
          // Fair rotation's starting value rides on room_created.
          "room_created",
          "fair_mode_toggled",
          // Each carries the whole saved config, so the last one is the layout the room ended on.
          "display_config_saved",
          "host_config_saved",
          "session_end_set",
        ],
      },
    })
    .sort({ timestamp: -1 })
    .limit(2000)
    .toArray()
    .then((docs) => docs.reverse());

  // Titles live in their own collection, expiring at 30 days (lib/mongodb.ts),
  // and are joined back by songDataId. The event rows outlive that expiry, so
  // an old room still shows *that* a song was added, just not which one.
  const songDataPromise = getYoutubeSongDataCollection().then((c) =>
    c.find({ roomId }).limit(2000).toArray()
  );

  // Raw occurrences: the dossier interleaves them with the song timeline,
  // because *when* an error hit relative to the room's activity is the
  // diagnostic fact — a count per message hides it. Newest-first + reverse for
  // the same reason as the events above: the cap must trim the start of the
  // night, not the errors that are still happening.
  const errorsPromise = getClientErrorsCollection().then((c) =>
    c
      .find({ roomId })
      .sort({ timestamp: -1 })
      .limit(MAX_ERROR_ROWS)
      .project({ _id: 0, message: 1, source: 1, page: 1, timestamp: 1 })
      .toArray()
      .then((docs) => docs.reverse())
  );

  // Counted separately so the dossier's total agrees with the room card's
  // uncapped badge instead of silently reporting the cap.
  const errorTotalPromise = getClientErrorsCollection().then((c) =>
    c.countDocuments({ roomId })
  );

  const [sessions, events, songDataDocs, errorRows, errorTotal] =
    await Promise.all([
      sessionsPromise,
      eventsPromise,
      songDataPromise,
      errorsPromise,
      errorTotalPromise,
    ]);

  const songDataById = new Map(songDataDocs.map((d) => [d.dataId, d]));
  // Pre-split events still carry their own fields, until the one-time
  // migration (scripts/split-youtube-song-data.mjs) clears them.
  const titleOf = (e: AnalyticsEvent): string | null =>
    (e.songDataId ? songDataById.get(e.songDataId)?.songTitle : e.songTitle) ?? null;
  const videoIdOf = (e: AnalyticsEvent): string | null =>
    (e.songDataId ? songDataById.get(e.songDataId)?.videoId : e.videoId) ?? null;

  const people = sessions.map((s) => ({
    userName: s.userName ?? null,
    role: s.role ?? null,
    firstSeen: s.firstSeen ?? null,
    lastSeen: s.lastSeen ?? null,
    country: s.country ?? null,
    city: s.city ?? null,
    locale: s.locale ?? null,
    localeSource: s.localeSource ?? null,
  }));

  const localeTally = new Map<string, { people: number; chosen: number }>();
  for (const s of sessions) {
    if (typeof s.locale !== "string") continue;
    const row = localeTally.get(s.locale) ?? { people: 0, chosen: 0 };
    row.people += 1;
    if (CHOSEN_LOCALE_SOURCES.includes(s.localeSource)) row.chosen += 1;
    localeTally.set(s.locale, row);
  }
  const languages = Array.from(localeTally, ([locale, row]) => ({
    locale,
    ...row,
  })).sort((a, b) => b.people - a.people);

  const createdLocale =
    events.find((e) => e.type === "room_created")?.locale ?? null;

  const songs: unknown[] = [];
  const requests: unknown[] = [];
  const singWithMe: unknown[] = [];
  const searchFails: {
    failReason: string | null;
    searchOutcome: string | null;
    timestamp: Date;
  }[] = [];
  const fairToggles: { enabled: boolean; timestamp: Date }[] = [];
  const cheersByEmoji = new Map<string, number>();
  const cheersByUser = new Map<string, number>();
  let reactions = 0;
  let searches = 0;
  const suggestions: {
    source: string;
    sectionId: string | null;
    categoryId: string | null;
    songTitle: string | null;
    songArtist: string | null;
    timestamp: Date;
  }[] = [];
  // undefined = the room predates the flag, so we genuinely don't know.
  let fairStarted: boolean | undefined;
  let displayConfig: DisplayConfig | null = null;
  let hostConfig: HostConfig | null = null;
  let displaySaves = 0;
  let hostSaves = 0;
  // Last write wins, same as the queue's own behavior; null = cleared or never set.
  let sessionEnd: { minutesFromNow: number | null; timestamp: Date } | null = null;

  for (const e of events) {
    switch (e.type) {
      case "song_added":
        songs.push({
          userName: e.userName ?? null,
          songTitle: titleOf(e),
          videoId: videoIdOf(e),
          via: e.via ?? "search",
          singers: typeof e.singers === "number" ? e.singers : null,
          timestamp: e.timestamp,
        });
        break;
      case "song_suggested":
        requests.push({
          userName: e.userName ?? null,
          songTitle: titleOf(e),
          videoId: videoIdOf(e),
          timestamp: e.timestamp,
        });
        break;
      case "singwithme_posted":
      case "singwithme_joined":
      case "singwithme_queued":
        singWithMe.push({
          kind: e.type.replace("singwithme_", ""),
          userName: e.userName ?? null,
          songTitle: titleOf(e),
          videoId: videoIdOf(e),
          timestamp: e.timestamp,
        });
        break;
      case "suggestion_used":
        suggestions.push({
          source: e.suggestionSource ?? "song_pick",
          sectionId: e.sectionId ?? null,
          categoryId: e.categoryId ?? null,
          // A "trending" title is a YouTube title and lives in youtube_song_data;
          // the rest are our own catalog names on the event.
          songTitle: e.songTitle ?? titleOf(e),
          songArtist: e.songArtist ?? null,
          timestamp: e.timestamp,
        });
        break;
      case "reaction_sent":
        reactions += 1;
        if (e.emoji) {
          cheersByEmoji.set(e.emoji, (cheersByEmoji.get(e.emoji) ?? 0) + 1);
        }
        if (e.userName) {
          cheersByUser.set(e.userName, (cheersByUser.get(e.userName) ?? 0) + 1);
        }
        break;
      case "search_performed":
        searches += 1;
        break;
      case "search_failed":
        searchFails.push({
          failReason: e.failReason ?? null,
          searchOutcome: e.searchOutcome ?? null,
          timestamp: e.timestamp,
        });
        break;
      case "room_created":
        if (typeof e.fairMode === "boolean") fairStarted = e.fairMode;
        break;
      case "fair_mode_toggled":
        if (typeof e.fairMode === "boolean") {
          fairToggles.push({ enabled: e.fairMode, timestamp: e.timestamp });
        }
        break;
      case "display_config_saved":
        // The boards-on-TV toggle writes this event with changedFields only, so a config-less
        // event must not blank the layout a real save left.
        displaySaves += 1;
        if (e.displayConfig) {
          // Normalize so configs saved before a field existed preview as today's shape.
          displayConfig = normalizeDisplayConfig(e.displayConfig);
        }
        break;
      case "host_config_saved":
        hostSaves += 1;
        if (e.hostConfig) hostConfig = normalizeHostConfig(e.hostConfig);
        break;
      case "session_end_set":
        sessionEnd = {
          minutesFromNow: e.minutesFromNow ?? null,
          timestamp: e.timestamp,
        };
        break;
    }
  }

  // Events are oldest-first, so the last toggle is the ending state; else the created value.
  const fairFinal = fairToggles.length
    ? fairToggles[fairToggles.length - 1].enabled
    : fairStarted;

  const byCountDesc = (a: { count: number }, b: { count: number }) =>
    b.count - a.count;

  res.status(200).json({
    roomId,
    people,
    songs,
    requests,
    singWithMe,
    suggestions,
    cheers: {
      total: reactions,
      byEmoji: Array.from(cheersByEmoji, ([emoji, count]) => ({ emoji, count }))
        .sort(byCountDesc),
      topCheerers: Array.from(cheersByUser, ([userName, count]) => ({
        userName,
        count,
      }))
        .sort(byCountDesc)
        .slice(0, 8),
    },
    errors: errorRows,
    searchFails,
    fairRotation: {
      started: fairStarted ?? null,
      final: fairFinal ?? null,
      toggles: fairToggles,
    },
    layout: {
      display: displayConfig,
      host: hostConfig,
      displaySaves,
      hostSaves,
    },
    languages: {
      /** null on rooms created before the language was recorded. */
      created: createdLocale,
      byLocale: languages,
    },
    // The night's bounds as analytics saw them; the caps above can trim the
    // start of a marathon room, in which case this is the observed span.
    span:
      events.length > 0
        ? {
            first: events[0].timestamp,
            last: events[events.length - 1].timestamp,
          }
        : null,
    sessionEnd,
    counts: {
      people: people.length,
      songs: songs.length,
      requests: requests.length,
      suggestions: suggestions.length,
      singWithMe: singWithMe.length,
      reactions,
      searches,
      errors: errorTotal,
    },
  });
}

async function handleDelete(
  res: NextApiResponse,
  roomId: string
) {
  const db = await getAnalyticsDb();

  const [events, sessions, errors, songData] = await Promise.all([
    db.collection("analytics_events").deleteMany({ roomId }),
    db.collection("analytics_sessions").deleteMany({ roomId }),
    getClientErrorsCollection().then((c) => c.deleteMany({ roomId })),
    // The TTL would clear these anyway; deleting now keeps "delete all data
    // for this room" honest.
    getYoutubeSongDataCollection().then((c) => c.deleteMany({ roomId })),
  ]);

  res.status(200).json({
    deleted: {
      events: events.deletedCount,
      sessions: sessions.deletedCount,
      errors: errors.deletedCount,
      songData: songData.deletedCount,
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  const { roomId } = req.query;
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "roomId is required." });
    return;
  }

  try {
    if (req.method === "GET") {
      await handleGet(req, res, roomId);
    } else {
      await handleDelete(res, roomId);
    }
  } catch (e) {
    console.error("Room detail error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
