# Postmortem: Vercel Hobby plan limits

## Summary

30-day usage approached and exceeded several Vercel Hobby plan limits at
once, which can pause the project for up to 30 days under Hobby policy.

## Impact

Over the trailing 30 days: 1.2M/1M function invocations, 5h06/4h Active CPU,
1.5M/1M CDN requests. Room `GET` polling accounted for roughly 72% of
invocations; hidden-tab session heartbeats accounted for roughly 30%.

## Timeline (UTC)

- 2026-10-22 — usage review surfaces all three limits exceeded or close to
  it; Hobby's pause-on-overage policy identified as an active risk, not a
  hypothetical one.
- Same day — immediate mitigations shipped (commit `5468250`): heartbeats
  only fire when the tab is visible; singer polling interval increased from
  5s to 8s.
- Same day — decision made: the owner won't pay for hosting, so the Reddit
  launch is postponed and the app migrates to Oracle Cloud Always Free +
  Cloudflare Tunnel (free) instead of a paid Vercel tier.

## Root cause

Usage grew from two sources that scale with concurrent open tabs rather than
active usage: session heartbeats firing from backgrounded/hidden tabs, and a
polling interval tuned for responsiveness rather than invocation cost. Both
are proportional to how many tabs are simply left open, not to how much
anyone is actually using the app, so usage outgrew the Hobby plan's limits
before traffic itself felt large.

## What went well

- Both mitigations (visible-only heartbeat, 5s→8s polling) shipped the same
  day usage was reviewed, before the plan actually paused the project.
- The decision to self-host rather than pay for a higher Vercel tier was
  made decisively and became the plan for `feat/self-host` (staging,
  backups, CI, load test) rather than a stopgap.

## What went wrong

- Usage wasn't being watched proactively — this was caught by a review, not
  an alert, and could have crossed into an actual pause first.
- No pre-launch estimate of per-tab invocation/CPU cost existed, so the
  Reddit launch was planned without knowing it would trip Hobby's limits.

## Action items

| Action | Owner | Status |
|---|---|---|
| Visible-only heartbeat, 5s→8s singer polling (`5468250`) | Anna | Done (same day) |
| Self-host on Oracle Always Free + Cloudflare Tunnel | Anna | Abandoned 2026-11-02 — moved to Vercel Pro; Oracle never had free Arm capacity (976 failed launch attempts Oct 22–Nov 2) and Hetzner stopped offering new cloud servers |
| Staging environment with its own data | Anna | Removed with the VM |
| Nightly database backups | Anna | GitHub Actions nightly (needs secrets) |
| CI pipeline (typecheck/lint/test/build + smoke) | Anna | Done |
| Load test against staging | Anna | Done; local targets only now that staging is gone |

## Follow-up (2026-11-02)

The self-host plan was dropped and the project upgraded to Vercel Pro
($20/mo including $20 of usage credit; current usage ~$1.50/mo, a 10x month
estimated ~$23), with a spend limit set in Billing. The platform-agnostic
pieces of `feat/self-host` (CI, health endpoint, kill switches, backups,
smoke and load tests) were kept. One trap surfaced in the move: Hobby fires
crons anywhere within the hour, Pro fires them on the minute, so the mop-up
slots at `:15` would have run before the window they check for and silently
done nothing. They were moved to `:47` (06:47 and 07:47 UTC in
`vercel.json`).
