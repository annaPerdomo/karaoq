# Phase 2 — shelves (OUTLINE — expand into numbered task files before executing)

Do not execute from this outline. After phase 1 ships and soaks, a capable model (or Anna +
Claude) expands this into `10-…` task files with the same rigor as 01–07. Key decisions are
already locked; recorded here so expansion needs no session archaeology.

## Locked decisions

- Shelf tiers (design doc §8): language + global shelves ALWAYS render; country trending is
  EARNED (≥8 distinct songs from ≥5 distinct rooms in the window) and ranks by **distinct
  rooms, not raw adds** (one enthusiastic PH room produced the platform's #1 — observed).
- Bare-video rows (ungrouped corpus videos) allowed on auto shelves, styled lighter than
  grouped songs; tap goes straight to preview.
- Launch order per region: promoted language shelf → Trending in [country] (where earned) →
  Crowd pleasers → global Trending → Language tab.
- No per-room history shelves, ever — rooms expire at 30 days; don't build on data
  scheduled for deletion (Anna's ruling).
- TW + JP starter packs: drafted FROM their own add history (the songs their rooms already
  chose — born resolved), Anna reviews before ship.
- Old static browse sections stay as the API-failure fallback until phase 2 runs clean for
  two weeks, then deleted.

## Work items to expand

1. **Shelf compute** — nightly cron step (runner from task 04): aggregate corpus + analytics
   into `shelves` docs ({_id: "trending:ID" | "classics" | "pack:cz-hity", titleKey, items:
   [{ref, kind: "song"|"video", score}], computedAt}). 14-day half-life decay; language
   pooling (all ES-speaking countries feed one Spanish signal — country lists live in
   COUNTRY_CONFIG, app/queue/songSuggestions.ts).
2. **`GET /api/suggestions/browse?country=`** — shelf list with hydrated display rows;
   `Cache-Control: s-maxage=3600, stale-while-revalidate` per country (takes browse off
   Atlas M0's ~100 ops/sec ceiling).
3. **Client browse swap** — DiscoveryBrowser reads shelves; static SONG_SECTIONS only as
   fetch-failure fallback. i18n keys for shelf titles ×10 locales. CLAUDE.md 300-line rule
   applies hard here.
4. **Curated shelves + wanted list** — pack shelves filter to songs with cuts; cutless
   curated songs are invisible (they're already the resolver's queue via cuts:[]).
5. **TW/JP packs** — generate draft pack JSON from those countries' youtube_song_data adds;
   Anna edits; add to LANGUAGE_PACKS + COUNTRY_CONFIG + PACK_SECTIONS + SECTION_LABELS
   (a test enforces LANGUAGE_PACKS ↔ PACK_SECTIONS parity).
6. **Observability** — `suggestion_used` gains `shelfId`; admin Suggestions view shows
   corpus size, cutless count, shelf coverage per country, last cron reports.
