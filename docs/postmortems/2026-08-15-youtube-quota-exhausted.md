# Postmortem: YouTube Data API quota exhausted

## Summary

One large karaoke room in Adelaide drained the entire 10,000-unit YouTube
Data API daily pool overnight, which blocked search for every other room
until the quota reset.

## Impact

One room (15 people) ran 47 searches plus retries, 152 of which failed once
the pool was exhausted. Every other room's search was unavailable for the
rest of the quota day.

## Timeline (UTC)

- Overnight — the Adelaide room's search traffic, plus retries on failed
  calls, consumes the full 10,000-unit daily pool.
- Following morning — search failures reported; quota exhaustion confirmed
  as the cause.
- Same day — mitigations shipped: a paste-a-YouTube-link flow (costs 1 unit
  via `videos.list` instead of a full search), honest "search is
  unavailable, quota exhausted" messaging instead of a generic error,
  search-cache freshness improvements, and other demand-reduction changes.

## Root cause

Nothing capped total daily burn across the whole app — the only limits in
place were per-IP, per-instance rate limits, which don't stop one room
(many distinct users, many requests) from spending the shared pool. Retries
on failed calls made it worse: each retry after exhaustion still counted
against usage in some cases.

## What went well

- The paste-a-link workaround shipped the same day and gave users a path
  that cost 1 unit instead of 100.
- The decision made that day — never ration a single room's searches,
  reduce total demand instead — held up and shaped every later fix.

## What went wrong

- No per-day, app-wide usage ledger existed, so there was no way to see the
  quota draining until it was gone.
- Several later dates (Aug 24, Aug 26, Sep 14–15) were initially
  misdiagnosed as repeat quota-exhaustion incidents; they turned out to be
  burst 429s misclassified as quota-out. The lack of a ledger as source of
  truth made each of these take longer to rule in or out than it should
  have.

## Action items

| Action | Owner | Status |
|---|---|---|
| Paste-a-YouTube-link flow (1-unit `videos.list`) | Anna | Done (same day) |
| Honest quota-exhausted messaging in search UI | Anna | Done (same day) |
| Search-cache freshness improvements | Anna | Done (same day) |
| Build a usage ledger as source of truth for quota state | Anna | Done — ledger shipped, converted to calls on 2026-10-22 |
| Request a quota increase from Google | Anna | Done — raised to 10,000 calls/day on 2026-10-21 |
