import {
  getAnalyticsDb,
  getHarvestCursorsCollection,
  getSearchCacheCollection,
  getSuggestionVideosCollection,
} from "./mongodb";
import { THIN_RESULTS } from "./suggestionVideos";
import { searchYoutubeApi, videoDetailFields } from "./youtubeSearch";
import { YoutubeApiError } from "./youtubeApi";
import {
  harvestKaraokeChannels,
  karaokeChannelHandles,
  type ChannelBatch,
  type HarvestCursor,
} from "./karaokeChannels";
import { isCutOf, matchHarvestToCatalog } from "./suggestionMatch";
import { MIN_ADD_ROOMS } from "./songCorpus";
import {
  suggestionCatalog,
  CATALOG_DURATION,
  CATALOG_SORT,
  type CatalogEntry,
} from "./suggestionCatalog";
import type { SearchResult } from "./searchCache";

/** videos.list takes up to 50 ids per call, and that ceiling sets the batch. */
const ID_BATCH = 50;

export interface ResolveReport {
  seededFromCache: number;
  seededFromAdds: number;
  /** A number that climbs is someone probing the add endpoint, not a bug. */
  rejectedAdds: number;
  seededFromChannels: number;
  channels: string[];
  missingChannels: string[];
  channelUnits: number;
  channelPages: number;
  channelsStoppedEarly: boolean;
  refreshed: number;
  dropped: number;
  /** Refreshes abandoned because the lookup failed. Deleting these instead was
   *  how one bad night wiped the catalog. */
  skipped: number;
  pinned: number;
  searched: number;
  widened: number;
  remaining: number;
}

async function resolvedKeys(): Promise<Set<string>> {
  const store = await getSuggestionVideosCollection();
  const docs = await store.find({}, { projection: { _id: 1 } }).toArray();
  return new Set(docs.map((d) => d._id));
}

/** Step 1 — free. A song searched in the last three weeks already has its
 *  results in search_cache; promote them rather than paying twice. */
export async function seedFromSearchCache(
  pending: CatalogEntry[]
): Promise<{ seeded: number; keys: string[] }> {
  if (pending.length === 0) return { seeded: 0, keys: [] };
  const cache = await getSearchCacheCollection();
  const store = await getSuggestionVideosCollection();
  const byCacheKey = new Map(
    pending.map((e) => [`${e.key}|${CATALOG_DURATION}|${CATALOG_SORT}`, e.key])
  );

  const hits = await cache
    .find({ key: { $in: Array.from(byCacheKey.keys()) } })
    .toArray();

  const now = new Date();
  const keys: string[] = [];
  for (const hit of hits) {
    const key = byCacheKey.get(hit.key);
    const results = (hit.results ?? []) as SearchResult[];
    if (!key || results.length === 0) continue;
    await store.updateOne(
      { _id: key },
      {
        $set: { results, refreshedAt: now },
        // The search that bought these ran when the cache entry was written.
        $setOnInsert: { resolvedAt: hit.createdAt ?? now },
      },
      { upsert: true }
    );
    keys.push(key);
  }
  return { seeded: keys.length, keys };
}

/** Step 2 — a song someone queued after tapping its suggestion was resolved by
 *  a human; turning that id into a result row costs a lookup, not a search. */
export async function seedFromAdds(
  pending: CatalogEntry[]
): Promise<{ seeded: number; rejected: number }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || pending.length === 0) return { seeded: 0, rejected: 0 };

  const byKey = new Map(pending.map((e) => [e.key, e]));
  const chosen = await addedVideoIdsBySuggestion(Array.from(byKey.keys()));
  if (chosen.size === 0) return { seeded: 0, rejected: 0 };

  const store = await getSuggestionVideosCollection();
  const now = new Date();
  let seeded = 0;
  let rejected = 0;

  const backed = Array.from(chosen.entries()).filter(
    ([, pick]) => pick.rooms >= MIN_ADD_ROOMS
  );
  for (let i = 0; i < backed.length; i += ID_BATCH) {
    const batch = backed.slice(i, i + ID_BATCH);
    const live = await fetchVideoRows(batch.map(([, pick]) => pick.videoId), key);
    if (!live) continue; // couldn't ask — try again tomorrow
    for (const [suggestionKey, pick] of batch) {
      const row = live.get(pick.videoId);
      if (!row) continue; // deleted or unembeddable — leave it for the search
      const entry = byKey.get(suggestionKey);
      if (!entry) continue;
      // Both halves arrived from a client. Without this, crafted adds pairing
      // any videoId with any catalog key get published as that song's answer
      // for every room, everywhere.
      if (!isCutOf(row.title, entry)) {
        rejected += 1;
        continue;
      }
      await store.updateOne(
        { _id: suggestionKey },
        {
          $set: { results: [row], topVideoId: pick.videoId, refreshedAt: now },
          $setOnInsert: { resolvedAt: now },
        },
        { upsert: true }
      );
      seeded += 1;
    }
  }
  return { seeded, rejected };
}

export interface CommunityPick {
  videoId: string;
  /** Distinct rooms, not raw adds — the vote one room can't run up alone. */
  rooms: number;
}

/** The videoId was split into youtube_song_data by the 30-day retention rule
 *  (lib/analytics), so the two are joined back on songDataId — which is also
 *  why this only sees the last month of adds. */
export async function addedVideoIdsBySuggestion(
  keys: string[]
): Promise<Map<string, CommunityPick>> {
  if (keys.length === 0) return new Map();
  const db = await getAnalyticsDb();
  const rows = await db
    .collection("analytics_events")
    .aggregate<{ _id: { key: string; videoId: string }; rooms: number }>([
      {
        $match: {
          type: "song_added",
          suggestionKey: { $in: keys },
          songDataId: { $exists: true },
        },
      },
      {
        $lookup: {
          from: "youtube_song_data",
          localField: "songDataId",
          foreignField: "dataId",
          as: "song",
        },
      },
      { $unwind: "$song" },
      { $match: { "song.videoId": { $exists: true } } },
      {
        $group: {
          _id: { key: "$suggestionKey", videoId: "$song.videoId" },
          rooms: { $addToSet: "$roomId" },
        },
      },
      { $set: { rooms: { $size: "$rooms" } } },
      // Most rooms first, so the first row seen for a key is its winner.
      { $sort: { rooms: -1 } },
    ])
    .toArray();

  const winners = new Map<string, CommunityPick>();
  for (const row of rows) {
    if (winners.has(row._id.key)) continue;
    winners.set(row._id.key, { videoId: row._id.videoId, rooms: row.rooms });
  }
  return winners;
}

/**
 * Null when the call failed; an empty map when YouTube answered and none of the
 * videos exist. Collapsing the two let one 403 read as every video being gone,
 * deleting hundreds of healthy entries.
 */
async function fetchVideoRows(
  videoIds: string[],
  key: string
): Promise<Map<string, SearchResult> | null> {
  const rows = new Map<string, SearchResult>();
  if (videoIds.length === 0) return rows;
  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics,status",
    id: videoIds.slice(0, ID_BATCH).join(","),
    key,
  });
  let resp: Response;
  try {
    resp = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // A timeout is the same "couldn't ask" as a 5xx, and must not propagate out
    // and abort the whole run.
    return null;
  }
  if (!resp.ok) return null;
  const data = await resp.json();
  for (const item of data.items ?? []) {
    // Unembeddable can't play in the room, so it's as good as deleted.
    if (item?.status?.embeddable === false) continue;
    const snippet = item?.snippet;
    if (!snippet || !item.id) continue;
    rows.set(item.id, {
      title: snippet.title ?? "",
      thumbnailUrl:
        snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
      videoId: item.id,
      ...videoDetailFields(item),
    });
  }
  return rows;
}

export interface ChannelSweepOptions {
  /** Total playlistItems.list pages for the sweep, across all channels. */
  totalPages: number;
  pagesPerChannel: number;
  /** Wall-clock stop, so the function is never killed mid-sweep. */
  deadlineMs: number;
  resweepAfterMs: number;
  maxCutsPerSong: number;
}

/** Step 3 — the one that works on a day search is completely spent: matches
 *  channel uploads against the catalog instead of asking search.list. */
export async function seedFromKaraokeChannels(
  pending: CatalogEntry[],
  opts: ChannelSweepOptions
): Promise<{
  seeded: number;
  channels: string[];
  missing: string[];
  units: number;
  pages: number;
  stoppedEarly: boolean;
}> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || pending.length === 0) {
    return {
      seeded: 0,
      channels: [],
      missing: [],
      units: 0,
      pages: 0,
      stoppedEarly: false,
    };
  }

  const store = await getSuggestionVideosCollection();
  const cursorStore = await getHarvestCursorsCollection();
  const saved = await cursorStore.find({}).toArray();
  const cursors = new Map<string, HarvestCursor>(
    saved.map((d) => [
      d._id,
      { playlistId: d.playlistId, pageToken: d.pageToken, completedAt: d.completedAt },
    ])
  );

  const seededKeys = new Set<string>();
  let extraUnits = 0;

  // Written per channel rather than buffered to the end: a sweep reads tens of
  // thousands of rows across minutes, and buffering meant a run that hit the
  // function timeout spent its whole budget and stored nothing.
  const onChannel = async ({ channel, videos, cursor }: ChannelBatch) => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    const unset: Record<string, ""> = {};
    if (cursor.playlistId) set.playlistId = cursor.playlistId;
    // Cleared, not left behind: a stale completedAt parks a channel that still
    // has pages as done.
    if (cursor.pageToken) set.pageToken = cursor.pageToken;
    else unset.pageToken = "";
    if (cursor.completedAt) set.completedAt = cursor.completedAt;
    else unset.completedAt = "";
    await cursorStore.updateOne(
      { _id: channel },
      {
        $set: set,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { upsert: true }
    );
    if (videos.length === 0) return;

    const matches = matchHarvestToCatalog(videos, pending, opts.maxCutsPerSong);
    if (matches.size === 0) return;

    // Durations and view counts aren't in a playlist row, so matched videos get
    // one enrichment pass — 1 unit per 50, and it buys the same badges a
    // searched row carries.
    const keys = Array.from(matches.keys());
    const now = new Date();
    for (let i = 0; i < keys.length; i += ID_BATCH) {
      const slice = keys.slice(i, i + ID_BATCH);
      const ids = slice.flatMap((k) => (matches.get(k) ?? []).map((v) => v.videoId));
      const detail = new Map<string, SearchResult>();
      for (let j = 0; j < ids.length; j += ID_BATCH) {
        extraUnits += 1;
        const rows = await fetchVideoRows(ids.slice(j, j + ID_BATCH), key);
        rows?.forEach((row, id) => detail.set(id, row));
      }

      for (const catalogKey of slice) {
        const fresh = (matches.get(catalogKey) ?? [])
          // Keep the channel's title when enrichment drops a row: a failed
          // lookup should cost the badges, not the song.
          .map((v) => detail.get(v.videoId) ?? {
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            videoId: v.videoId,
          })
          .filter((r) => r.videoId);
        if (fresh.length === 0) continue;

        const existing = await store.findOne({ _id: catalogKey });
        // A serving entry holds up to fifty arrangements; the harvest has a
        // handful, so overwriting would be a downgrade.
        if (existing && existing.results.length >= THIN_RESULTS) continue;
        // maxCutsPerSong bounds one channel's contribution, but the entry may
        // reach the serving floor — otherwise a song only channels carry could
        // never accumulate enough cuts to be served.
        const results = mergeResults(
          existing?.results ?? [],
          fresh,
          Math.max(opts.maxCutsPerSong, THIN_RESULTS)
        );
        await store.updateOne(
          { _id: catalogKey },
          {
            $set: { results, refreshedAt: now },
            $setOnInsert: { resolvedAt: now },
          },
          { upsert: true }
        );
        seededKeys.add(catalogKey);
      }
    }
  };

  const harvest = await harvestKaraokeChannels(karaokeChannelHandles(), {
    totalPages: opts.totalPages,
    pagesPerChannel: opts.pagesPerChannel,
    deadlineMs: opts.deadlineMs,
    resweepAfterMs: opts.resweepAfterMs,
    cursors,
    onChannel,
  });

  return {
    seeded: seededKeys.size,
    channels: harvest.channels,
    missing: harvest.missing,
    units: harvest.units + extraUnits,
    pages: harvest.pages,
    stoppedEarly: harvest.stoppedEarly,
  };
}

/** Existing rows first so a merge only ever adds — the cap must never be what
 *  drops a cut the store already had. */
function mergeResults(
  existing: SearchResult[],
  fresh: SearchResult[],
  cap: number
): SearchResult[] {
  const seen = new Set(existing.map((r) => r.videoId));
  const merged = existing.slice();
  for (const row of fresh) {
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    merged.push(row);
  }
  return merged.slice(0, Math.max(cap, existing.length));
}

/** Step 4 — re-reads an aging entry and resets the retention clock, which is
 *  what makes "resolve once, keep forever" policy-legal. */
export async function refreshStale(
  olderThan: Date,
  limit: number
): Promise<{ refreshed: number; dropped: number; skipped: number }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { refreshed: 0, dropped: 0, skipped: 0 };

  const store = await getSuggestionVideosCollection();
  const stale = await store
    .find({ refreshedAt: { $lt: olderThan } })
    .limit(limit)
    .toArray();

  let refreshed = 0;
  let dropped = 0;
  let skipped = 0;
  for (const doc of stale) {
    try {
      const ids = doc.results.map((r) => r.videoId).slice(0, ID_BATCH);
      const live = await fetchVideoRows(ids, key);
      // Nothing was learned. Reading the silence as "all gone" deleted working
      // entries over a transient 403; the doc has a fortnight of TTL slack.
      if (!live) {
        skipped += 1;
        continue;
      }
      const results = ids
        .map((id) => live.get(id))
        .filter((r): r is SearchResult => Boolean(r));
      dropped += ids.length - results.length;

      if (results.length === 0) {
        // YouTube answered and everything is gone; the next tap re-resolves it.
        await store.deleteOne({ _id: doc._id });
        continue;
      }
      const topStillLive =
        doc.topVideoId && results.some((r) => r.videoId === doc.topVideoId);
      await store.updateOne(
        { _id: doc._id },
        {
          $set: { results, refreshedAt: new Date() },
          ...(topStillLive ? {} : { $unset: { topVideoId: "" } }),
        }
      );
      refreshed += 1;
    } catch (e: any) {
      // One bad doc must not end the pass over the other 399.
      console.warn("Suggestion refresh skipped:", doc._id, e?.message);
      skipped += 1;
    }
  }
  return { refreshed, dropped, skipped };
}

/** Step 5 — the only step touching the search quota. Capped per run so the
 *  cron can never be why a room's search failed. */
export async function resolveBySearch(
  pending: CatalogEntry[],
  limit: number
): Promise<{ searched: number }> {
  if (limit <= 0 || pending.length === 0) return { searched: 0 };
  const store = await getSuggestionVideosCollection();
  let searched = 0;

  for (const entry of pending.slice(0, limit)) {
    try {
      const results = await searchYoutubeApi(
        entry.query,
        CATALOG_DURATION,
        CATALOG_SORT
      );
      if (results.length === 0) continue;
      const now = new Date();
      await store.updateOne(
        { _id: entry.key },
        {
          $set: { results, refreshedAt: now },
          $setOnInsert: { resolvedAt: now },
        },
        { upsert: true }
      );
      searched += 1;
    } catch (e: any) {
      // Only a spent quota ends the run. A timeout must not forfeit the rest
      // of the night's budget — a day of catalog progress that can't be earned
      // back — so everything else is one song's bad luck.
      if (e instanceof YoutubeApiError && e.quotaExceeded) {
        console.warn("Suggestion resolve stopped, quota spent:", e?.message);
        break;
      }
      console.warn("Suggestion resolve skipped", entry.key, e?.message);
    }
  }
  return { searched };
}

/** Set the community's pick on entries that have one. Free — no API call. */
export async function pinPopularPicks(): Promise<{ pinned: number }> {
  const store = await getSuggestionVideosCollection();
  const docs = await store.find({}).toArray();
  if (docs.length === 0) return { pinned: 0 };

  const chosen = await addedVideoIdsBySuggestion(docs.map((d) => d._id));
  let pinned = 0;
  for (const doc of docs) {
    const pick = chosen.get(doc._id);
    if (!pick || pick.rooms < MIN_ADD_ROOMS || pick.videoId === doc.topVideoId) {
      continue;
    }
    // Only pin what the entry holds, or an unvetted videoId is promoted to the
    // top of a list it was never part of.
    if (!doc.results.some((r) => r.videoId === pick.videoId)) continue;
    await store.updateOne({ _id: doc._id }, { $set: { topVideoId: pick.videoId } });
    pinned += 1;
  }
  return { pinned };
}

/** Resolved but holding few cuts, so eligible for a search-backed upgrade once
 *  nothing is unresolved. Without this they stay thin forever: being resolved
 *  is what keeps a song out of the pending list. */
export async function thinEntries(
  minResults: number,
  demand: Map<string, number>
): Promise<CatalogEntry[]> {
  const store = await getSuggestionVideosCollection();
  const docs = await store
    .find({ $expr: { $lt: [{ $size: "$results" }, minResults] } })
    .toArray();
  const catalog = suggestionCatalog();
  return docs
    .map((doc) => catalog.get(doc._id))
    .filter((e): e is CatalogEntry => Boolean(e))
    .sort((a, b) => (demand.get(b.key) ?? 0) - (demand.get(a.key) ?? 0));
}

/** Catalog songs with nothing stored yet, most-tapped first. */
export async function pendingEntries(
  demand: Map<string, number>
): Promise<CatalogEntry[]> {
  const done = await resolvedKeys();
  return Array.from(suggestionCatalog().values())
    .filter((e) => !done.has(e.key))
    .sort((a, b) => (demand.get(b.key) ?? 0) - (demand.get(a.key) ?? 0));
}
