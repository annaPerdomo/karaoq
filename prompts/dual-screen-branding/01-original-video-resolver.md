# 01 — Resolve the original music video for a queued song

## Why
A second screen behind the stage should play the original music video of whatever karaoke song is on. Nothing in KaraoQ knows a karaoke cut's original video today. This prompt adds a server endpoint that finds it for a queued entry, cached and quota-safe, so prompt 02 can build the screen on top.

## What to build

### 1. `lib/originalVideo.ts` (pure, no I/O)
```ts
export const ORIGINAL_NOISE: RegExp; // karaoke|instrumental|backing track|minus one|sing ?along|lyrics?|cover|piano version|key of|in the style of
export function originalVideoQuery(songTitle: string, corpus?: { artist: string; title: string } | null): string | null;
export function pickOriginalCandidates(results: SearchResult[], max = 3): string[];
```
- `originalVideoQuery`: when `corpus` is given, return `` `${artist} ${title} official video` ``. Otherwise from `songTitle`: drop bracketed/parenthesised segments that match `ORIGINAL_NOISE` or `version`; split on ` | ` and fullwidth `｜`, clean each segment, keep the first non-empty one; strip a trailing ` - <segment>` only when it is a known karaoke channel name (Sing King, KaraFun, Zoom Karaoke, CC Karaoke, Stingray Karaoke, Karaoke Version) or consists solely of noise words — never a generic ` - <words> Karaoke` strip, which eats the song title in `Artist - Song Karaoke`. `ORIGINAL_NOISE` must be word-bounded with unicode-aware lookarounds (built via `new RegExp(..., "iu")`) and include non-Latin markers (караоке, カラオケ, 노래방, 伴奏, 歌詞); brackets include `【】（）「」`; bracket phrases like "originally performed by" drop the whole bracket; strip remaining `ORIGINAL_NOISE` words; collapse whitespace; return `null` if fewer than 2 characters remain; else append ` official video`.
- `pickOriginalCandidates`: drop results whose `title` matches `ORIGINAL_NOISE`; stable-sort titles containing `official` (case-insensitive) first; return up to `max` `videoId`s.

### 2. `GET /api/queue/[id]/original-video?entryId=<id>` → `pages/api/queue/[id]/original-video.ts`
Response: `{ status: "ok" | "none" | "quota", videoIds: string[] }`.
- 405 for non-GET. `rateLimit(req, "original-video", 30, 60_000)` → 429.
- Load the room; 404 if missing. Find the entry by `entryId` in `room.queue`; 404 if absent. **The search text comes only from that entry** (invariant 1).
- Look up corpus artist/title for `entry.videoId` (`karaoke_videos` → `karaoke_songs`; reuse whatever lookup helper exists, else a small one in `lib/originalVideo.ts`'s neighbour `lib/originalVideoLookup.ts`). Missing → `null`.
- `q = originalVideoQuery(...)`; `null` → `{status:"none", videoIds:[]}`.
- `key = searchCacheKey(q)`; on `readCache(key)` hit (any age the existing search route would still serve, including the outage fallback) → `pickOriginalCandidates`.
- On miss: if `searchQuotaSpent()` → `{status:"quota", videoIds:[]}`. Otherwise call `searchYoutubeApi(q, "any", "relevance")`, account for the spend exactly as `pages/api/search.ts` does, `writeCache(key, results)`, pick. A thrown search error → `{status:"quota"}` if it is a quota error per the existing classification in search.ts, else 502.
- Empty pick → `status:"none"`.
- `Cache-Control: private, no-store`.
- Analytics: `trackEvent(req, "original_video_resolved", { roomId, source: "cache" | "live" | "quota" | "none" })` when not exempt.
- Do **not** feed these results into the corpus, `recordSearchResults`, `bankSearchEvidence`, or search-demand stats — they are not karaoke cuts.

## Tests
`tests/lib/originalVideo.test.ts`:
1. `Queen - Bohemian Rhapsody (Karaoke Version)` → `Queen - Bohemian Rhapsody official video`.
2. `Dancing Queen | Karaoke Version | ABBA` style ` | ` suffix is dropped.
3. `Sing King - Someone Like You (Lower Key) Karaoke` loses `Sing King` and `Karaoke` and the key bracket.
4. Corpus input wins over the title.
5. A title that is only noise (`Karaoke Instrumental`) → `null`.
6. `pickOriginalCandidates` drops karaoke/lyrics/cover titles, puts `Official` first, caps at `max`.

`tests/api/originalVideo.test.ts` (copy the displayConfig fixture style):
7. Unknown entryId → 404; no search spent.
8. Cache hit → `ok`, `searchYoutubeApi` not called.
9. Cache miss + quota spent → `quota`, no call.
10. Cache miss → one live call, cache written, spend recorded, `ok`.
11. All results are karaoke titles → `none`.
12. Rate limit → 429.

## Out of scope
Any UI, the second screen, sync, prefetching, persisting the result on the room or queue entry, a new Mongo collection, corpus changes.
