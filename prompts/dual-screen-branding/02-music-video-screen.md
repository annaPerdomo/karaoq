# 02 — The music video screen

## Why
With prompt 01 the server can name a song's original video, but there is no screen to show it on. Organizers with a second TV behind the stage want that video playing muted, in step with the karaoke video. The common setup is one laptop driving two outputs (two windows in the same browser), so sync must be tight there and still reasonable across devices.

## What to build

### 1. Shared player helpers — `components/player/ytCommand.ts`
Extract from `components/Display.tsx` (moves only, same behavior):
```ts
export function ytCommand(iframe: HTMLIFrameElement | null, func: string, args?: unknown[]): void;
export function parseYtMessage(e: MessageEvent, iframe: HTMLIFrameElement | null): { event: string; info?: any } | null;
```
`parseYtMessage` holds the existing origin/source/JSON checks from Display's message listener. Rewire Display.tsx to use both. **Display.tsx must end shorter than it started.**

### 2. Playhead broadcast — `app/queue/roomChannel.ts`
```ts
export interface PlayheadMessage { entryId: string; seconds: number; playing: boolean; sentAt: number } // sentAt = serverNow()
export function broadcastPlayhead(roomId: string, msg: PlayheadMessage): void;
export function onPlayhead(roomId: string, cb: (msg: PlayheadMessage) => void): () => void;
```
In Display.tsx, on `infoDelivery` carrying `currentTime` (and on `onStateChange`), broadcast the current entry's playhead, throttled to at most once per 1000 ms. Ask the iframe to `listening` if the existing code does not already, so `infoDelivery` arrives. Keep it to a handful of lines; put the throttle in a pure helper in `ytCommand.ts` or a small hook under `components/display/hooks/`.

### 3. Sync math — `lib/musicVideoSync.ts` (pure)
```ts
export const DRIFT_SEEK_S = 1.5;
export const PLAYHEAD_FRESH_MS = 3000;
export function serverPlayhead(r: { isPlaying: boolean; playStartedAt?: string | Date | null; playPausedAt?: string | Date | null }, nowMs: number): number | null;
export function targetSeconds(server: number | null, playhead: PlayheadMessage | null, entryId: string, nowMs: number, offsetS: number): number | null;
export function syncAction(currentS: number | null, targetS: number | null, playing: boolean): { seekTo?: number; play: boolean };
```
- `serverPlayhead`: null when not playing or no start; paused → `(pausedAt - startedAt)/1000`; else `(now - startedAt)/1000`; never negative.
- `targetSeconds`: prefer a playhead for the same `entryId` with `nowMs - sentAt <= PLAYHEAD_FRESH_MS` (add elapsed when `playing`), else `server`; add `offsetS`; clamp at 0; null stays null.
- `syncAction`: `seekTo` only when `|current - target| > DRIFT_SEEK_S` (or current is null); `play` mirrors `playing`.
`nowMs` is always `serverNow()` at the call site.

### 4. The screen
- Route `pages/display/[joinCode]/video.tsx` — thin wrapper like `pages/display/[joinCode]/index.tsx` (same head/noindex treatment).
- Orchestrator `components/MusicVideoScreen.tsx` (≤ 300 lines); parts in `components/musicvideo/`: `MusicVideoPlayer.tsx` (muted iframe; `embedSrc` with `mute=1&controls=0&playsinline=1&rel=0`, sends `mute` on ready, reports `onError` codes 100/101/150), `MusicVideoIdle.tsx` (shown when nothing plays, while resolving, on `none`/`quota`, after all candidates fail, or when the original ends first — reuse `components/QrJoinCard.tsx` and the now-playing song title), styles in `styles/MusicVideo.module.css`.
- Hook `components/musicvideo/hooks/useOriginalVideo.ts`: `useOriginalVideo(joinCode, entryId | null, nextEntryId | null): { videoId: string | null; status: "loading" | "ok" | "none" | "quota" | "busy"; fail: () => void }`. Fetches prompt 01's endpoint (it only answers for the active entry and the one after it; anything else is 404 — treat as `none`). `busy` is transient: show idle and retry that entry once after 20 s, never in a tight loop. Caches final answers per entryId for the page's life, `fail()` advances to the next candidate. After the current entry resolves `ok`, prefetch the next entry once.
- Room state: `getRoom(joinCode)` **without** `display` (invariant 2) via `startVisiblePolling` at `MUSIC_VIDEO_POLL_MS = 3000`, plus adopt `onRoomState` broadcasts immediately. Call `recordServerTime(room.serverNow)` like Display does.
- Sync loop: every 1000 ms and on every room/playhead update, read the player's `currentTime` (from `infoDelivery`) and apply `syncAction`. Pause the video when the karaoke is paused.
- Offset: per entry, ArrowLeft / ArrowRight nudge `offsetS` by ∓/± 0.5 s, reset on song change, briefly show the value (`musicVideo.offset`). Keep only in component state.

### 5. Entry point on the host
In the gear (`components/host/SettingsPopover.tsx`), host-only (not co-hosts), add a row **"Music video screen"** with an **Open** button (`window.open('/display/<code>/video', '_blank')`) and a **Copy link** button using the same copy-feedback pattern already used elsewhere on the host. If SettingsPopover would cross 300 lines, put the row in `components/host/MusicVideoScreenRow.tsx`.

### 6. Analytics (invariant 8)
- New route `pages/api/analytics/screen-event.ts`: `POST { roomId, type, data }` (whitelist lookup with `hasOwnProperty`, never `in`; payload built from validated keys only, never spread; `roomId` validated as a real room code), `rateLimit(req, "screen-event", 60, 60_000)`, 400 unless `type` is in the whitelist below and `data` matches that type's shape exactly (numbers clamped, enums checked, unknown keys rejected). Calls `trackEvent`. Client helper `postScreenEvent(roomId, type, data)` in `app/queue/screenEvent.ts`: fire-and-forget `fetch` with `keepalive: true`, never throws.
- Whitelist (add all to `EventType`):
  - `music_video_screen_opened` `{}` — once per page load, after the first room read.
  - `music_video_screen_closed` `{ durationSeconds: number; songsShown: number; songsUnavailable: number }` — on `pagehide`; `songsShown` = entries where a video actually reached playing state, `songsUnavailable` = entries that ended in `none`/`quota`/all-candidates-failed.
  - `music_video_error` `{ code: number }` — each YouTube `onError` on this screen; any integer 0–999.
  - `music_video_offset` `{ offsetSeconds: number }` — on song change, only if the finished entry's offset was non-zero (tells us how often sync needs a manual nudge).
  - `music_video_link` `{ action: "open" | "copy" }` — the gear row buttons.
  - `logo_upload_rejected` `{ reason: "type" | "size" }` — reserved for prompt 04's client-side rejections.

### i18n (`lib/i18n/en.json`)
- `musicVideo.title`: "Music video screen"
- `musicVideo.hint`: "Shows the original video of each song, muted and in time with the karaoke. Open it on a second screen."
- `musicVideo.open`: "Open"
- `musicVideo.copy`: "Copy link"
- `musicVideo.copied`: "Copied"
- `musicVideo.waiting`: "The music video starts with the next song"
- `musicVideo.unavailable`: "No music video for this one"
- `musicVideo.offset`: "Video offset {{seconds}}s" (match the catalog's existing interpolation syntax)

## Tests
1. `tests/lib/musicVideoSync.test.ts`: `serverPlayhead` playing / paused / not started / negative clamp.
2. `targetSeconds` prefers a fresh same-entry playhead, ignores a stale or other-entry one, applies offset, clamps.
3. `syncAction` seeks only past `DRIFT_SEEK_S`, seeks when current is null.
4. `tests/app/roomChannel` (or existing file): playhead round-trips through `broadcastPlayhead`/`onPlayhead` with a mocked `BroadcastChannel`.
5. `tests/components/MusicVideoPlayer.test.tsx`: iframe src carries `mute=1` and the video id.
6. `useOriginalVideo`: `fail()` moves to the next candidate, then to `none`; prefetches next entry once.
7. MusicVideoScreen never calls `getRoom` with `{ display: true }` and never fetches `display-seen`, `display-paused`, `video-ended` or `play`.
8. Existing Display tests stay green.
9. `screen-event` route: accepts each whitelisted type, rejects unknown types, extra keys and out-of-range values (400), rate limits (429).
10. MusicVideoScreen posts `opened` once and `closed` on `pagehide` with the right counts.

## Out of scope
Branding (prompt 03/04), audio of any kind, server-side playhead reporting (no new writes), pairing codes, a link from the Display page, choosing a different original video by hand.
