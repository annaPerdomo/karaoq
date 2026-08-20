# Phase 3 — freshness + curation loop (OUTLINE — expand before executing)

Prereq: phase 2 shipped and stable. Expand into task files before execution.

## Work items

1. **Chart feeder** — weekly cron step: iTunes RSS per-country song charts (free, no key,
   zero YouTube quota) → for each supported country, upsert cutless `karaoke_songs` docs
   (our-data names from the chart, `demand` seeded modestly, country tag). The invariant is
   the quality gate: a chart song renders on a "Fresh in [country]" shelf only once the
   resolver/harvest finds it a karaoke cut — unresolvable chart pop stays invisible at zero
   cost. Guard: cap chart-created songs per country (~30) so the wanted queue stays
   curated-and-demanded first.
2. **"Fresh in [country]" shelves** — chart-sourced songs with cuts, newest first.
3. **Co-occurrence shelf** ("rooms also sang…") — pairwise song co-occurrence across rooms'
   add histories; needs a traffic floor, gate like country trending.
4. **Propose-approve queue in /admin** — per region: most-added corpus songs absent from
   that region's pack, with counts; approve writes to the pack shelf. First real case: TW
   (the #5 country by adds with no Mandarin pack — found in production data). Anna's
   standing rule: propose-then-approve, never auto-add.
5. **Cleanup** — after a 2-week clean soak: drop `suggestion_videos` + its accessor, delete
   `lib/suggestionVideos.ts` legacy paths, the static browse fallback, and any remaining
   references (grep). Update `docs/song-corpus/README.md` status.
6. **Quota-increase day** — when Google grants it: raise `SUGGESTION_RESOLVE_PER_RUN` for a
   night or two to drain all cutless songs; nothing else changes by design.
