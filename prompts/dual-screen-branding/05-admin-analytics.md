# 05 — Admin panel: second screen & branding

## Why
Anna needs to see whether these features get used, whether they work, and whether people like them, without opening Mongo. Prompts 01–04 emit the events. This prompt adds one admin view that reads them, plus logo storage against its $0 budget.

## Events available (from prompts 01–04)
`original_video_resolved { source: cache|live|quota|busy|none }`, `music_video_screen_opened`, `music_video_screen_closed { durationSeconds, songsShown, songsUnavailable }`, `music_video_error { code }`, `music_video_offset { offsetSeconds }`, `music_video_link { action }`, `logo_uploaded { bytes }`, `logo_upload_rejected { reason }`, `brand_saved { logo, colors, cleared, surface }`. All carry `roomId`, `timestamp`, `country`.

## What to build

### 1. `GET /api/analytics/screens?days=7|30|90` → `pages/api/analytics/screens.ts`
Auth exactly like the other admin analytics routes (copy `pages/api/analytics/quota.ts`'s guard). Default `days=30`; any other value → 400. One aggregation pass per section; no per-room loops. Shape (export the type from `components/admin/types.ts`, which is near its size limit — put it in `components/admin/screens/types.ts` instead):
```ts
export interface ScreensStats {
  days: number;
  musicVideo: {
    rooms: number;               // distinct rooms with music_video_screen_opened
    opens: number;
    repeatRooms: number;         // rooms that opened it on ≥2 distinct UTC days in the window
    medianMinutesOpen: number | null;
    songsShown: number; songsUnavailable: number;      // summed from screen_closed
    resolve: Record<"cache" | "live" | "quota" | "busy" | "none", number>;
    errors: { code: number; count: number }[];
    songsNudged: number;         // music_video_offset count
    medianAbsOffset: number | null;
    links: { open: number; copy: number };
    daily: { day: string; rooms: number }[];   // YYYY-MM-DD, one per day in window, zero-filled
  };
  brand: {
    roomsWithLogo: number;       // distinct rooms with a brand_saved logo:true in window
    roomsWithColors: number;
    saves: Record<"host" | "display", number>;
    clears: number;
    uploads: number;
    rejected: Record<"type" | "size" | "storage_full", number>;
    storageBytes: number;        // logoStoreBytes()
    storageBudgetBytes: number;  // LOGO_STORE_BUDGET_BYTES
    committedLogos: number;      // room_logos docs without expireAt
  };
  feedback: { id: string; createdAt: string; kind: string; message: string; page?: string }[];
  // up to 20 newest feedback entries in the window whose page ends in "/video"
  // OR whose roomId is in the set of rooms that used either feature.
}
```

### 2. Admin view — `components/admin/screens/`
- `ScreensView.tsx` (orchestrator, fetches with the same hook/fetch pattern and window selector the Pulse/Quota views use), `MusicVideoSection.tsx`, `BrandSection.tsx`, `FeatureFeedback.tsx`. Each ≤ 300 lines.
- Reuse the existing chart components only: `charts/StatTile`, `charts/ColumnChart` (daily rooms), `charts/BarList` (resolve sources, error codes, rejection reasons), and `pulse/Disclosure` for the feedback list. Reuse `styles/Admin.module.css` classes; no new chart code.
- Music video section, top row tiles: **Rooms using it**, **Came back** (repeat rooms, with % of rooms), **Videos found** (`songsShown / (songsShown + songsUnavailable)` as %), **Needed a nudge** (`songsNudged / songsShown` as %). Then daily rooms chart, resolve-source bar list labelled "From cache / Live search / Quota out / Busy / Not found", error codes bar list with labels 100 "Removed", 101/150 "Embedding blocked", other "Other", median minutes open, open vs copy link counts.
- Brand section tiles: **Rooms with a logo**, **Rooms with colours**, **Logo storage** (`storageBytes` formatted as KB/MB of `storageBudgetBytes`, plus %; render the tile in the existing warning style when ≥ 80%), **Uploads rejected** with the reason bar list; saves by rail (Host vs Display).
- Feedback list: date, kind, first 200 chars of message, page; links to the existing Feedback view if it supports deep links, otherwise plain.
- Register the view in `components/admin/AdminShell.tsx` as **"Screens"** with an icon from `components/admin/icons.tsx` (reuse an existing glyph if none fits). Admin is English-only like the rest of the admin UI; do not add i18n keys.

## Tests
1. `tests/api/analyticsScreens.test.ts`: unauthenticated → 401 (match sibling routes); bad `days` → 400.
2. Seeded events produce the right `rooms`, `repeatRooms` (two days vs one day), `resolve` counts, medians, zero-filled `daily`.
3. Brand stats: `saves` split by surface, rejected reasons, storage bytes and committed count from seeded `room_logos`.
4. Feedback filter picks `/video` pages and feature rooms only, caps at 20, newest first.
5. `tests/components/ScreensView.test.tsx`: renders tiles from a fixture; storage tile switches to warning at 80%; empty state when no events.

## Out of scope
Changing Pulse or other views, `pages/api/analytics/data.ts` (already oversized — do not add to it), new chart types, exporting data, alerts.
