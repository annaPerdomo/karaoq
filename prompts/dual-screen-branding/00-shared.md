# Shared context — dual-screen music video + club branding

**Work in `/Users/anna/Documents/Code/karaoq-dual`** (a git worktree on branch `feat/dual-screen-branding`). Never touch `/Users/anna/Documents/Code/karaoq` — that is another branch in progress.
Stack: Next.js pages router, TypeScript (ES5 target), MongoDB, CSS modules, vitest. Read `CLAUDE.md` in the worktree in full; its component-size and split rules are binding.

## Origin
A club organizer (Belgrade) runs non-commercial karaoke nights with two screens: the stage screen plays the karaoke video (the only audio), and the big screen behind the stage should show the **original music video of the same song, muted and in sync**. They also want the **club's logo and colours** on the screens.

## Domain facts
- Room + queue types: `pages/api/types.ts`. `QueueEntry { id, userName, songTitle, videoId, durationSeconds?, addedAt? }` — `songTitle` is free text (often a YouTube karaoke title like `Queen - Bohemian Rhapsody (Karaoke Version)`). Playback lives on `Room`: `isPlaying`, `activeVideoIndex`, `playStartedAt`, `playPausedAt` (on resume `playStartedAt` moves forward by the pause length), `serverNow` (computed on GET). `DisplayConfig`/`HostConfig` + `normalize*Config`, `DEFAULT_*_CONFIG` live there too.
- Validation limits: `lib/limits.ts`. Rate limiting: `rateLimit(req, key, max, windowMs)` (see `pages/api/queue/[id]/display-config.ts`). Analytics: `trackEvent` + `isAnalyticsExempt(req)` in `lib/analytics.ts` — call `trackEvent` only when not exempt, the way existing routes do.
- Room reads on clients: `getRoom(joinCode, opts?)` (`app/queue/getRoom.ts`). **`{ display: true }` is the display heartbeat — only the main Display may pass it.** Polling: `startVisiblePolling` (`app/queue/pollWhileVisible.ts`). Server clock: `serverNow()` / `recordServerTime()` in `lib/clockSkew.ts`.
- Same-browser fast path between windows: `app/queue/roomChannel.ts` (`BroadcastChannel`; `broadcastRoomState`/`onRoomState`, etc.). Copy its style for new messages.
- Main display: `components/Display.tsx` (728 lines — over limit) + `components/display/*`. The player is a plain `<iframe>` from `embedSrc(videoId, params)` (`components/player/embed.ts`) driven by raw `postMessage` (`{event:'command', func, args}`) and read back via `window` `message` events (`onStateChange`, `infoDelivery`, `onError`).
- YouTube search: `searchYoutubeApi(q, duration, sortBy)` in `lib/youtubeSearch.ts` (already `videoEmbeddable=true`); cache `readCache(key)` / `writeCache(key, results)` in `lib/searchCache.ts`; key builder `searchCacheKey(q)` in `lib/searchQuery.ts`; quota `searchQuotaSpent()` in `lib/searchQuotaStatus.ts`; spend accounting `recordSpend` (`lib/corpusBudget.ts`). `pages/api/search.ts` shows the exact read-cache → quota → live call → record → write-cache sequence. Mirror it; do not invent another accounting path.
- Corpus: `karaoke_videos` / `karaoke_songs` collections (`lib/mongodb.ts`, `lib/songEntry.ts`) hold clean `artist`/`title` for corpus cuts.
- i18n: add keys to `lib/i18n/en.json` **and** every `public/i18n/*.json` locale (cs, de, es, fil, fr, id, ja, ko, pt) — `i18n.test.ts` enforces key parity. Components call `useT()` themselves.
- Tests: `tests/api/displayConfig.test.ts` is the fixture to copy for API routes (mocked Mongo, rate limit, analytics); `tests/components/DisplayStage.test.tsx` for components.

## Invariants
1. **Quota is solved by demand reduction, never rationing.** A YouTube search may only ever be spent for a song that is actually in the room's queue, only when a music-video screen asks for it, and every result is cached so a song is searched at most once per cache window across all rooms. Never search from a client-supplied string.
2. The music-video screen is a **viewer**: it never sends the display heartbeat, never posts `display-paused`/`video-ended`/`play`, never mints a play token, never changes room state. The karaoke video on the main Display (or host "here" mode) stays the only audio and the only source of truth.
3. The music-video player is always muted.
4. Host and Display Customize must not drift: any brand option appears on both, using one shared control component.
5. Logos are raster only (PNG/JPEG/WebP). Never accept or serve SVG.
6. Do not rename CSS-module classes or change existing i18n keys. No file you touch may end over 300 lines unless it already was, and an already-oversized file (`Display.tsx`, `Host.tsx`) must not grow: extract a seam per CLAUDE.md to pay for any lines you add.

7. **Logos must cost $0 to store and serve.** The database is a free-tier Atlas cluster (512 MB total, shared with everything else). Logos are capped at 64 KB each and 25 MB in total, drafts expire on their own, a room keeps one committed logo, logos of expired rooms are pruned, and logo responses are immutable-cacheable so repeat views never reach the server. No new paid services, no new cron entries.
8. **Every user-facing step of these features is measured** so the admin panel can show usage, quality and reception (prompt 05). Server events go through `trackEvent` (it already skips exempt traffic); add each new name to the `EventType` union in `lib/analytics.ts`. Client-only moments go through the single whitelisted route `POST /api/analytics/screen-event` (created in prompt 02). Events carry no free text and no personal data.

## Banned
No "seamless", "robust", "leverage", "simply", "just" in UI copy or commit messages. No new dependencies. No Context providers or state libraries.

## Finish checklist (every prompt)
- While iterating: `npx tsc --noEmit -p tsconfig.json` and the affected tests (`pnpm exec vitest run <paths>`).
- Once at the end: `pnpm lint`, `pnpm build`, `pnpm exec vitest run` (full suite).
- Do **not** commit, `git add`, or stash.
- Report in under 150 words: files changed (with line counts for any .tsx), i18n keys added, anything left out, and the final line of each command.
