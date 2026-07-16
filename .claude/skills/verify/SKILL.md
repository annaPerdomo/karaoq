# Verify karaoq changes in the running app

## Launch

```bash
pnpm dev                # repo root; reads .env.local (real Mongo) — ready in ~2s on :3000
```

## Drive a browser

No browser-automation dep in the repo. Install `playwright-core` in the session
scratchpad and launch the cached Chrome for Testing:

```js
const exe = `${HOME}/Library/Caches/ms-playwright/chromium-<latest>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
```

Seed localStorage via `context.addInitScript` to skip onboarding gates:
`karaoq_host_name` (host welcome), `karaoq_username` + `karaoq_seen_tips` (singer name gate).

## Seed a room end-to-end (no UI clicking needed)

Use a throwaway code like `KQTEST1` (pattern `^[A-Z0-9]{3,12}$`), never a code a
live tab might be using:

```bash
POST /api/queue/KQTEST1                                  # create (201)
POST /api/queue/KQTEST1/videos                           # queue a song {entryId,userName,videoId,songTitle}
POST /api/queue/KQTEST1/sing-with-me                     # {id,songTitle,videoId,createdBy,anonymous,minSingers,maxSingers}
POST /api/queue/KQTEST1/suggestions                      # {id,songTitle,videoId,suggestedBy,anonymous}
POST /api/queue/KQTEST1/play?isPlaying=true              # simulate on-stage
```

All `id`s are uuids. Surfaces: `/host/CODE`, `/sing/CODE`, `/display/CODE`.
Display polls every 1.5s, singer page every 5s — wait ~2.5s after a server-side
change before asserting the display picked it up.

## Cleanup (always)

Delete test rooms straight from Mongo with the repo's driver:

```bash
node --env-file=.env.local -e '...deleteMany on rooms {id}, analytics_events {"props.roomId"}, analytics_sessions {roomId}...'
```

## Gotchas

- The user often has a live dev tab open on localhost:3000 — don't stop/start
  playback in rooms you didn't create.
- Overflow probe (`scrollWidth > clientWidth` on documentElement) catches layout
  breaks fast; check at 1440 for display, 320/390 for phone surfaces.
