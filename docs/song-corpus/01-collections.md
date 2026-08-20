# Task 01 — corpus collections

Read `README.md` in this directory first. Depends on: nothing. Blocks: everything else.

## Objective

Add three collections + accessors to `lib/mongodb.ts`, following the file's existing
patterns exactly (TTL latch, collMod fallback, typed accessor functions).

## Spec

All three live in the main DB (same `client.db(process.env.MONGODB_DB)` as
`suggestion_videos`), not the analytics DB.

```ts
// One doc per playable video we know about. The ONLY collection allowed to hold
// YouTube-derived fields. TTL = YOUTUBE_DATA_MAX_AGE_DAYS (import from lib/youtubeRetention)
// on refreshedAt — the nightly sweep rewrites that field, so a maintained doc never
// expires and an unmaintained one deletes itself exactly when policy requires.
export interface KaraokeVideoDoc {
  _id: string;                       // videoId
  title: string;
  thumbnailUrl: string;
  channelTitle?: string;
  durationSeconds?: number;
  viewCount?: number;
  songKey?: string;                  // karaoke_songs._id, when grouped
  sources: {
    adds?: { count: number; byCountry: Record<string, number>; lastAt: Date };
    harvest?: { channel: string; matchedAt: Date };
    seed?: boolean;                  // migrated from suggestion_videos (task 03)
    search?: { at: Date };           // banked from a user-paid live search (task 05)
  };
  firstSeenAt: Date;
  refreshedAt: Date;                 // TTL clock
}

// One doc per song identity. ZERO YouTube-derived fields — our names, our counts,
// videoId references only. No TTL.
export interface KaraokeSongDoc {
  _id: string;                       // songKey = searchCacheKey(buildSearchQuery(`${artist} ${title}`, true))
  title: string;                     // OUR name (curated or from the suggestion catalog)
  artist: string;
  nativeTitle?: string;
  nativeArtist?: string;
  cuts: string[];                    // ranked videoIds, cap 12; [] = wanted/unresolved
  topVideoId?: string;               // most-added cut — powers the "Most sung" badge
  addCount: number;
  addsByCountry: Record<string, number>;
  lastAddedAt?: Date;
  packIds?: string[];                // curated packs referencing this song ("core", "cz", …)
  demand: number;                    // suggestion_used taps; resolver priority for cuts:[]
}

// Resumable-job cursors (task 04). TTL 7d on updatedAt.
export interface CronStateDoc {
  _id: string;                       // step name, e.g. "sweep", "harvest", "migrate-v1"
  cursor?: string;
  done?: boolean;
  updatedAt: Date;
}
```

## Steps

1. In `lib/mongodb.ts`, add the three interfaces and accessors
   `getKaraokeVideosCollection` / `getKaraokeSongsCollection` / `getCronStateCollection`.
2. Copy the `suggestion_videos` accessor's TTL-ensure block for `karaoke_videos`
   (`refreshedAt`, `expireAfterSeconds: YOUTUBE_DATA_MAX_AGE_DAYS * 24 * 60 * 60`) and
   `cron_state` (`updatedAt`, 7 days) — including the latch-even-on-failure + collMod
   fallback and the comment explaining it.
3. Non-TTL indexes, same fire-and-forget ensure style: `karaoke_videos.songKey`,
   `karaoke_songs` on `{ demand: -1 }`.
4. Unit tests in `tests/lib/` mocking the mongodb module are NOT needed for accessors alone;
   compile-level coverage suffices. Do not write tests that hit a real DB.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` clean; `pnpm exec vitest run` unchanged from baseline.
- The word "youtube" appears nowhere in `KaraokeSongDoc`'s fields (grep the diff).

## Out of scope

No feeders, no reads, no cron changes, no data migration.
