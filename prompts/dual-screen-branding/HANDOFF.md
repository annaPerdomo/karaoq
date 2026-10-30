# Handoff — dual-screen music video + club branding

Branch `feat/dual-screen-branding` (based on `origin/main`). Started from a feedback submission (2026-10-26) by a club organizer in Belgrade running non-commercial karaoke nights: a second screen behind the stage showing the original music video muted and in sync, plus the club's logo and colours. Anna has already replied to them.

## Done (committed on this branch)
- **01** original-video resolver — `GET /api/queue/[id]/original-video` (statuses ok | none | quota | busy). Commit `6e9e0ce`.
- **02** music video screen — `/display/[joinCode]/video`, playhead sync, host gear entry, `POST /api/analytics/screen-event`. Commit `8d57c71`.

## To do, in order
- **03** `03-brand-data.md` — room brand type, logo store (64 KB/logo, 25 MB total budget, drafts expire 24 h, orphan prune in the existing cron), logo + brand APIs.
- **04** `04-brand-ui.md` — shared BrandControls in both Customize rails, applied on Display, Host, music video screen.
- **05** `05-admin-analytics.md` — admin "Screens" tab (usage, quality, reception, logo storage vs budget).

## How to run each remaining prompt (the /prompt-pack loop)
For each prompt: one implementation agent reads `00-shared.md` + the prompt and executes it (no commit) → a fresh reviewer agent reviews the pending diff (BLOCKER / SHOULD FIX / NEEDS DISCUSSION / CONSIDER) → the same implementation agent applies the fixes, trims comments, commits one conventional commit (no Co-Authored-By, no AI mention) → `git status` must be clean. If a fix changes what a later prompt assumes, edit that prompt file too.

## Rules that bite
- Read `CLAUDE.md`: no component over ~300 lines; `Display.tsx` (723) and `Host.tsx` (1636) must not grow — pay for added lines by extracting a seam.
- i18n keys go in `lib/i18n/en.json` AND all 9 `public/i18n/*.json` (parity test).
- Quota: demand reduction only, never rationing. Logos must stay $0 (free-tier Atlas).
- Never mark the feedback entry handled; Anna does that.
- No test plan section in the PR; no AI attribution in commits or PR body.

## Before opening the PR
Drop the handoff commit (it only adds `prompts/dual-screen-branding/`, which is gitignored on main):
```
git rebase --onto <handoff-commit>^ <handoff-commit>
```
Then `pnpm exec vitest run`, `npx tsc --noEmit -p tsconfig.json`, `pnpm build`, push, and open the PR against `main` with a `## Summary` bullet per prompt.

## Hand-verify (not covered by tests)
- Two windows in one browser on two screens: original video tracks the karaoke within ~1.5 s, through pause/resume and song change; arrow-key offset.
- Second device: sync from server clock only.
- Songs with Cyrillic / Japanese titles resolve to the original, not a karaoke cut.
