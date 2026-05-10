# karaoq — Product Evolution Proposal

> From house party proof-of-concept to the karaoke queue app bars actually want to use.

## Vision

karaoq is a real-time karaoke queue manager that lets anyone host a karaoke night with just a browser. Singers search YouTube, join the queue, and the host screen drives the room. No downloads, no hardware, no DJ software — just a join code (or QR scan) and a screen.

**Today:** A working POC for friends — create a room, search YouTube, queue songs, play them on the host screen with 3-second polling.

**Tomorrow:** A polished, auth-optional platform where organizers run recurring karaoke nights with analytics, singers build a personal song history, and bars pay for a branded, TV-optimized experience.

---

## Current State

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (Pages Router) |
| Database | MongoDB Atlas (free tier) |
| Video | YouTube Data API v3 |
| Auth | None — localStorage username only |
| Styling | CSS Modules, dark theme |
| Sync | Polling (3s interval) |
| Deploy | Vercel |

**What works well:**
- Clean host/singer split — two distinct UX paths from a single join code
- YouTube search → queue → play loop is intuitive
- Polling is simple and serverless-friendly
- Dark theme looks good on a TV across the room

**What's missing:**
- No user identity beyond a typed name
- Rooms are ephemeral — no event history, no song recall
- No fairness logic — one person can queue 10 songs in a row
- No analytics for organizers
- No differentiation from other YouTube karaoke tools
- Not portfolio-grade yet (no tests, no CI, no error handling strategy)

---

## Target Users

### Tier 1 — Friends (free, immediate)
Me and my friends running karaoke at someone's house. We want it to just work, remember what we sang last time, and feel fun to use.

### Tier 2 — Organizers (free, near-term)
The person who hosts karaoke regularly — at home, at a community event, at a college dorm. They want to see stats across nights, manage the queue fairly, and share a QR code instead of spelling out a URL.

### Tier 3 — Bars & Venues (paid, future)
A bar that runs karaoke weekly and currently uses pen-and-paper or an expensive KJ system. They want their branding on the screen, a TV-optimized display, recurring event scheduling, and maybe a tip jar or priority queue to drive revenue.

---

## Feature Roadmap

### Phase 1 — Auth & Identity

**Goal:** Let users optionally sign in so we can build features on top of identity.

- [ ] NextAuth.js integration (Google provider — free, frictionless)
- [ ] Everything continues to work without signing in (auth is additive, never gating)
- [ ] MongoDB `users` collection: `{ id, email, name, image, createdAt }`
- [ ] Singer name auto-populates from auth profile (falls back to localStorage)
- [ ] Session persistence across devices

**Why NextAuth.js:** Free, first-party Next.js support, supports multiple providers, handles JWT/session management. Mirrors the auth patterns in kannanao (Supabase Auth) but stays within the MongoDB ecosystem.

### Phase 2 — Data Model & Song History

**Goal:** Rooms become "events" with history. Songs are trackable per-singer.

- [ ] New collections:
  - `events` — `{ id, joinCode, name, hostId, createdAt, endedAt, songCount, singerCount }`
  - `songHistory` — `{ id, eventId, userId, songTitle, videoId, queuedAt, performedAt }`
  - `favorites` — `{ userId, videoId, songTitle, addedAt }`
- [ ] Event auto-creates when host starts a room, closes when host ends it
- [ ] Authenticated singers see "My Songs" tab: past performances across all events
- [ ] One-tap re-queue from song history
- [ ] "Favorites" — heart a song to save it, quick-add from favorites list
- [ ] Song deduplication warning: "Someone already queued this song tonight"

### Phase 3 — Queue Intelligence

**Goal:** Make the queue fairer and more informative.

- [ ] **Round-robin rotation** — after you sing, you go to the back of the rotation. Prevents one person dominating the queue
- [ ] **Wait time estimate** — "You're 3 songs away (~12 min)" based on average song duration
- [ ] **Queue position indicator** — clear visual of where you are in line
- [ ] **Song limit per rotation** — configurable max songs per person per round (default: 1)
- [ ] **Skip/remove** — host can remove a song or skip the current one

### Phase 4 — Host & Organizer Experience

**Goal:** Make hosting karaoke a first-class experience.

- [ ] **QR code on host screen** — scan to join instantly (using `qrcode.react`)
- [ ] **TV Display Mode** — full-screen, large-text view optimized for bar TVs and living room screens. Shows: current song + singer, up next, QR code, room branding
- [ ] **Event dashboard** — authenticated organizers see past events with stats:
  - Songs played, unique singers, most popular songs, peak queue depth
  - Event timeline (when songs were queued and performed)
- [ ] **End event** flow — host ends the night, event is archived with full history
- [ ] **"Now Singing" announcement** — prominent display when it's someone's turn

### Phase 5 — Social & Engagement

**Goal:** Features that make karaoq more fun than a pen-and-paper signup sheet.

- [ ] **Crowd reactions** — audience members can send emoji reactions during a performance (fire, applause, laugh) — shown on host screen
- [ ] **Song requests** — audience can suggest songs for specific singers ("sing Bohemian Rhapsody!")
- [ ] **Duet support** — queue a song with multiple singers
- [ ] **"Encore" vote** — audience can vote for an encore of a great performance
- [ ] **Singer stats card** — shareable card: "Anna sang 5 songs at Friday Karaoke. Top genre: 80s Pop"

### Phase 6 — Bar & Venue Features (Paid Tier)

**Goal:** Features that justify a subscription for commercial venues.

- [ ] **Organization accounts** — a bar creates an org, manages multiple recurring events
- [ ] **Branding** — bar logo, custom accent color on host/display screens
- [ ] **Recurring events** — "Every Friday at 8pm" auto-creates rooms with consistent join codes
- [ ] **Priority queue / tip jar** — singers pay $2-5 to jump ahead. Revenue goes to the venue. (Stripe integration)
- [ ] **Song catalog management** — venue can curate an approved song list or block explicit content
- [ ] **Multi-room** — large venues with multiple karaoke rooms managed under one org
- [ ] **Analytics export** — CSV/PDF reports for venue owners (busiest nights, popular songs, repeat customers)
- [ ] **Kiosk mode** — tablet at the bar for walk-up song requests (no phone needed)

---

## Architecture Evolution

### Current
```
Browser ──polling──▶ Next.js API Routes ──▶ MongoDB
                     (Pages Router)
```

### Target
```
Browser ──polling──▶ Next.js API Routes ──▶ MongoDB
   │                 (Pages Router)            │
   │                      │                    │
   ▼                      ▼                    ▼
NextAuth.js          Middleware           users
(Google OAuth)       (rate limiting,      events
                      auth checks)       songHistory
                                         favorites
                                         organizations (Phase 6)
```

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | NextAuth.js (Google) | Free, native Next.js, no extra service. Auth is optional — unauthenticated users still get the core queue experience |
| Database | Stay on MongoDB | Already working, free tier is generous (512MB), document model fits our data well. No reason to migrate |
| Real-time | Stay on polling | Serverless-friendly, no WebSocket infra cost. 3s is fine for karaoke (nobody notices a 3s delay when there are 5 songs in the queue). Can upgrade to SSE later if needed |
| Styling | Migrate to a component library (MUI or similar) | CSS Modules won't scale to 20+ components with theming. A design system enables the bar branding feature and ensures consistency |
| Testing | Vitest + React Testing Library | Lightweight, fast, good Next.js integration. Add Playwright for E2E smoke tests |
| CI/CD | GitHub Actions | Lint → Type-check → Test → Build on every PR. Mirrors the kannanao pipeline |
| Error handling | Sentry (free tier) | Catch production errors before users report them. Essential for a bar relying on this during a live event |
| Rate limiting | API middleware | Prevent abuse on public endpoints. IP-based with auth bypass for known users |

### What stays the same
- Next.js on Vercel (free tier handles the traffic for friends + a few bars easily)
- MongoDB Atlas free tier (512MB is plenty for years of karaoke history)
- YouTube Data API (free quota: 10,000 units/day — roughly 100 searches/day, more than enough)
- Polling-based sync (upgrade path to SSE exists but isn't needed yet)

---

## Portfolio Quality Goals

Inspired by the quality bar set by [kannanao](https://github.com/annaPerdomo/kannanao), karaoq should demonstrate:

### Engineering Rigor
- [ ] TypeScript strict mode throughout
- [ ] Vitest + RTL unit tests (70%+ coverage target)
- [ ] Playwright E2E smoke tests (create room → join → queue song → play)
- [ ] GitHub Actions CI pipeline: lint → type-check → test → build
- [ ] Pre-push hooks via Husky
- [ ] Zod validation on all API inputs
- [ ] Structured error handling with Sentry integration

### Design System
- [ ] Component library (MUI or custom) with consistent tokens
- [ ] Theming support (at minimum: dark mode default + venue-customizable accent colors)
- [ ] Responsive design tested on phone, tablet, and TV/large-screen
- [ ] Accessibility: ARIA labels, keyboard navigation, proper heading hierarchy

### Documentation
- [ ] README with: hook paragraph, feature list, architecture diagram, tech stack table, local dev setup, trade-offs, "what I'd do differently"
- [ ] CLAUDE.md development guide with conventions and patterns
- [ ] This proposal as living documentation

### Code Quality
- [ ] 300-line file size soft limit
- [ ] Custom hooks for data fetching (useRoom, useQueue, useEvents, useSongHistory)
- [ ] Clean separation: pages → components → hooks → API routes → DB operations
- [ ] No `any` types, no disabled lint rules without justification

### Production Readiness
- [ ] Rate limiting on public API endpoints
- [ ] Input sanitization (prevent XSS in usernames, song titles)
- [ ] Graceful error states (room not found, API down, YouTube quota exceeded)
- [ ] Loading skeletons instead of spinners
- [ ] Optimistic UI updates with rollback

---

## Monetization Strategy (Phase 6)

### Free Tier (always free)
- Create and join rooms
- YouTube search and queue
- Song history and favorites (authenticated)
- Basic event history
- QR code joining

### Venue Tier (~$29-49/month — TBD)
- Organization account with branding
- Recurring event scheduling
- TV Display Mode with custom logo
- Priority queue / tip jar integration
- Analytics dashboard and export
- Multi-room support
- Priority support

### Why this pricing
- Replaces KJ software that costs $200-500+ plus hardware
- A bar running karaoke weekly easily justifies $30/month
- No hardware purchase — works on any screen with a browser
- Tip jar feature can pay for the subscription itself

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| YouTube API quota exceeded | Low (10k units/day is generous) | Cache search results per room session; show warning at 80% quota |
| YouTube blocks embeds for some videos | Medium | Graceful fallback: show "this video can't be embedded" and auto-skip |
| MongoDB free tier storage limit | Low (512MB is years of data) | Monitor usage; archive old events if needed |
| Bar WiFi is unreliable | High | Polling is resilient to intermittent connectivity; queue state persists server-side; reconnect gracefully |
| Scope creep delays shipping | High | Phases are designed to be independently shippable. Each phase delivers value on its own. Ship Phase 1-3 before touching Phase 6 |
| Existing competition (karafun, singa, etc.) | Medium | Differentiate on: no hardware required, free tier, modern UX, YouTube catalog (unlimited songs vs. licensed library). Bars hate paying $300/month for legacy KJ software |

---

## Trade-offs & Honest Constraints

- **Polling over WebSockets** — 3s latency is acceptable for karaoke. WebSockets add deployment complexity (can't use simple serverless). Will upgrade to SSE if latency becomes a real complaint.
- **YouTube dependency** — The entire song catalog depends on YouTube. If YouTube changes their embed policy or API, we have a problem. Mitigation: the queue/event system is video-source agnostic by design. Could add Spotify or other providers later.
- **No offline support** — Karaoke needs internet for video playback anyway. PWA caching doesn't add much value here.
- **NextAuth over Supabase Auth** — kannanao uses Supabase, but karaoq is already on MongoDB. Adding Supabase just for auth would mean two databases. NextAuth keeps everything in one stack.
- **MUI bundle size** — Adding MUI increases the JS bundle. Worth it for theming, accessibility, and development speed. Can tree-shake aggressively.

---

## What I'd Do Differently If Starting Over

- **App Router from day one** — Pages Router works but App Router is the future of Next.js. Will migrate if/when the rewrite is justified.
- **Database migrations** — MongoDB is schema-less but that doesn't mean schema changes are free. Should have version-tracked migration scripts from the start.
- **Design tokens first** — Should have established spacing, color, and typography tokens before writing any CSS. Would make the theming story cleaner.
- **E2E tests from the first feature** — Karaoke has a clear happy path (create → join → search → queue → play → next). Should have had a Playwright test for this on day one.

---

## Build Order (What to Ship First)

```
Phase 1: Auth & Identity .............. ~1 week
Phase 2: Data Model & Song History .... ~1 week
Phase 3: Queue Intelligence ........... ~1 week
Phase 4: Host & Organizer Experience .. ~1-2 weeks
   ── Ship v1.0 here: usable by friends with full feature set ──
Phase 5: Social & Engagement .......... ~1-2 weeks
   ── Ship v2.0 here: fun, differentiated, portfolio-ready ──
Phase 6: Bar & Venue Features ......... ~2-3 weeks
   ── Ship v3.0 here: sellable to venues ──
```

Portfolio quality work (tests, CI, README, error handling) is **not a phase** — it's woven into every phase. Every PR should include tests. CI should be set up in Phase 1.

---

*Last updated: 2026-04-26*
