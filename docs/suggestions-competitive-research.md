# Live song suggestions: what competitors do, and what KaraoQ should build

*Research date: 2026-10-29. This brief is for the agent building suggestions on `feat/hot-ideas` (worktree `../karaoq-hot`).*

Source tags: **[V]** = checked against an official page, help center, release note or app-store listing. **[R]** = reviews, forums or third-party write-ups. **[I]** = inference. Every source URL is in §8.

---

## 0. TL;DR

1. **No karaoke product makes suggestions that react to the live room.** We checked KaraFun, Singa, Smule, StarMaker, Yokee, Apple Music Sing, Sing King, Lucky Voice, Stingray, Kanto, DAM, JOYSOUND, TJ, KY, Rockbot, TouchTunes, OpenKJ and the free YouTube queue apps. Guest phones get catalog search plus editorial rows at best. KaraFun's Remote even *hides* playlists and favorites from guests [V]. The only queue-aware logic anywhere is:
   - KaraFun **Automix**: picks background *filler music* to fit the next queued song [V].
   - Spotify **Jam**: "group recommendations" built from members' taste plus songs already queued [V]. That is music, not karaoke.

   "Because this room is on 2000s pop-punk, try…" is unclaimed. This is the wedge.
2. **Popularity data never comes back into the night.**
   - Venues see "most played" in back-office dashboards (KaraFun Business, Singa Business). Guests don't.
   - Nobody shows "most sung *in this room tonight* / *in your city this week*".
   - We already have the hard part (rooms shelf, country charts, a corpus we can serve instantly). We just don't scope it to the room or to time.
3. **The idle TV is wasted everywhere except Japan.** DAM CHANNEL runs programming on the room TV whenever nothing is playing [S]. KaraFun shows the next 5 singers [V]. Nobody puts *song ideas* on the TV during changeovers or an empty queue.
4. **Japan is the real benchmark, and it slices by era/age and occasion, not genre.**
   - JOYSOUND's "my-age ranking" (enter a birth year, see what that cohort sings) is explicitly pitched as picking songs *for the group* [V].
   - DAM's みんなの声 ("everyone's voice") lets you pick up to 3 situations (date, work party, Christmas, graduation…); the lists come from surveys of karaoke users [V].
   - Personal fit there means **key**, not taste.
5. **"I don't know what to sing" has only shallow answers.**
   - Lucky Voice "Feeling Lucky?" assigns a random singer and song [V]; "Pass the Mic" is a social prompt [V].
   - Queueoke (the open-source clone closest to us) has a Gemini "AI DJ": mood in, LLM picks out, resolved to YouTube [V]. That violates our serve-only-resolved rule unless it is mapped onto the corpus.
   - Nobody offers an "easy first song" path inside a *party* app. Difficulty tiers exist only in solo-practice apps (Simply Sing, Sing King, Kanto).
6. **What to build, in order:**
   1. A room-aware "For this room" shelf (exclude what's sung, follow the room's language/era, diversify).
   2. Time-scoped trending: tonight / this week / in your country, counted by distinct rooms.
   3. Cross-room co-occurrence ("rooms that sang X also sang Y").
   4. Easy-first and duet tags.
   5. Ideas on the TV during changeovers and empty queues.
   6. Vibe/occasion chips.

   Non-singer interactivity (dares, votes) comes after, per Anna's "make suggestions great first" ruling. See §5.

---

## 1. Where we are today (`feat/hot-ideas` @ `cafeed2`)

So you can map each idea onto real code:

| Surface | Where | Signal |
|---|---|---|
| **Hot tab** (default) with Country picker | `components/songsearch/HotTab.tsx`, `PlacePicker.tsx`, `hooks/useHotPlace.ts` | Geo country (UI language only when country is unknown) |
| 🔥 Hot shelf (rank, ↑ climb, NEW badges) | `lib/shelves.ts`, `/api/suggestions/shelves` | Apple RSS most-played top 50 × 24 countries → `chart_snapshots` (ranks/prevRanks/since); widens country → language → world; ≥5k-view sing-along cut |
| 🎤 Rooms shelf | `lib/shelves.ts` | `song_added` over 14 days, ranked by **distinct rooms** (≥2), widens the same way |
| Other-country charts | `/api/suggestions/world` | Same chart data, every country at once |
| 💿 Classics / Genre / Voice Type / regional pack | `app/queue/songSuggestions.ts`, `public/suggestions/*.json` | Hard-coded curation |
| 🎲 Surprise me | `useDiscoveryBrowse` | Random across sections |
| Idea tap → versions list → ConfirmModal | `app/queue/suggestionCuts.ts`, `/api/suggestions/cuts` | Corpus; zero quota |
| Suggestions board (guest-posted, claimable) | `components/SocialBoards.tsx`, `boards/SuggestionCard.tsx`, `/api/queue/[id]/suggestions*` | Humans only; claimed 61% of the time (55/90) — our best non-singer loop |
| TV | `display/DisplaySidebar.tsx` → `BoardsSummary` | Board posts only; **no ideas on the TV** |
| Analytics | `suggestion_used` (source: random/song_pick/genre_chip/shelf), `song_added.suggestionKey` + `fromCorpus` | — |

**What is *not* live today:**
- Shelves are identical for every room with the same country/language. That is good for the CDN, but it means:
  - no awareness of the current queue;
  - songs already sung tonight aren't hidden;
  - no sense of time of night or energy;
  - no per-guest seed;
  - nothing trending within the night;
  - nothing on the TV.

**The baseline numbers to beat** (30 days, measured 2026-10-24): ideas = **6% of adds** (295/4,978). Genre-chip open → song tap = 61%. Song tap → add within 5 min = 63%. The old trending feature: 4 adds from 81 opens.

---

## 2. Competitor landscape

### 2.1 Summary matrix

| Product | Charts / most sung | Editorial rows | Personal | Room/queue-aware | TV used for picks | "Don't know what to sing" |
|---|---|---|---|---|---|---|
| **KaraFun** (app/Remote/Business) | Global Top 100, Top US, Top 2025 [V]; venue "most played" in the dashboard only [V] | Expert playlists by mood/theme [V] | **Vocal Match**: record a range sweep → match % per song [V] | ❌ Remote = plain catalog, no favorites/playlists [V]. Automix fits *filler music* to the next song [V] | Next-5-singers banner, selfies [V] | Music Quiz, Battle, Interlude [V] |
| **Singa** (app/Party Mode/Business) | Top/Hot filters (Mar 2026) [V]; "Most sung songs" in venue guest view [V]; public per-country SEO charts [V] | Hundreds of "singlists" by decade/occasion [V] | "Recommended For You" = languages+genres picked once [V] | ❌ Party Mode (Mar 2026) has no suggestion layer and no fairness [V] | Ad manager on venue screens [V] | — |
| **Smule** | Trending [V] | Explore playlists | Engagement-driven recs; users call them bad and language-blind [R] | Social graph only | — | Open duets with strangers |
| **StarMaker** | Popular recordings [R] | Featured | Personalized songbook [R] | — | — | **"Hook"**: sing just the best part [R] |
| **Yokee** (YouTube-based) | Trending [V] | Artist/genre/theme | Community-preference feed [R] | — | — | — (hits behind VIP; top complaint) [R] |
| **Apple Music Sing** (tvOS 26) | — | Genre/artist/decade rows [V] | Not documented [I] | Shared Sing Queue, emoji reactions on TV [V], no recs | Reactions only | — |
| **Sing King** | Daily chart adds, monthly charts [V] | Mood/occasion | — | — | — | Game mode, leaderboards |
| **Lucky Voice** | — | Weekly playlists [V] | Pre-built playlists | — | — | **"Feeling Lucky?"** random singer+song; **"Pass the Mic"** [V] |
| **Kanto** | — | Curated | "Songs similar to what you selected," vocal range, singing level [V-ish/R] | — | — | — |
| **Queueoke** (OSS, YouTube, QR — our closest clone) | — | — | Local favorites | Queue **upvotes** reorder the queue [V] | Confetti/soundboard | **Gemini "AI DJ"**: mood → LLM → YouTube [V] |
| **DAM** (Japan) | Daily ranking, weekly new songs, **by era / by age / by generation** [V]; nationwide score leaderboards incl. today/by prefecture [S] | **みんなの声**: situation tags from user surveys [V]; seasonal features | Recommended key from gender + voice type [V]; history; **face search** (photo → age/mood → songs) [V] | ❌ | **DAM CHANNEL** plays on the TV whenever no song is playing; rankings and new songs [S] | Fuzzy search with nicknames; **per-country rankings for foreign visitors** [V] |
| **JOYSOUND** (Japan) | **My-age ranking** (birth year → what that cohort sings, "guaranteed to liven up the room") [V]; new-song trend ranking; by gender | "Easy to sing" feature [V] | Recommended key after 3 songs [V]; range analysis → **songs that fit your range** [V]; **前回のカラオケ** (re-queue your last session) [V] | In-room score contest | — | Auto guide vocal fills parts you don't know (X1, Nov 2026) [S] |
| **TJ / KY** (Korea) | TOP100/HOT100 by genre, daily new songs [S] | Theme lists; KY's "song recommendation list" for when you're stuck [S/V] | TJ app: taste-based recs, favorites with saved key [V] | — | — | — |
| **Spotify Jam** (analog) | — | — | Overlap of members' tastes | ✅ **Group recs = members' taste + songs already queued**; shows **who added each song** [V] | — | — |
| **Rockbot / TouchTunes** (bar jukebox) | Venue playlists, trending, year-end charts [V] | Venue-approved catalog | Recent/top plays | Rockbot: 👍 votes, points/levels [V] | — | Paid "play next" (TouchTunes) |
| **Festify / SongUp** (party jukebox) | — | Fallback playlist when empty [V] | — | Festify: votes order the queue. SongUp: fair rotation, explicitly *against* voting [V] | TV mode | — |
| **OpenKJ, RequestYourSong, other KJ apps** | RequestYourSong: per-KJ "top 40 most requested" [V] | Songbook | Favorites | ❌ | — | — |

### 2.2 Ideas worth stealing, by competitor

- **KaraFun Automix** [V]. The one existing proof that "fit to what's queued" is a sensible product idea. They apply it to filler music. We apply it to singer suggestions.
- **KaraFun Vocal Match** [V]. Its match % is a strong UX pattern ("sing it or skip it"). We can't do mic analysis cheaply. The light version is a per-device voice choice (low / mid / high) that we already half-have as the Voice Type tab. Make it a *filter on every shelf* rather than a separate tab.
- **Singa "Recommended For You" = declared languages + genres** [V]. Proof that declared preferences without history are good enough to ship.
- **Singa Top/Hot filters + public most-sung charts** [V]. Same shape as our Hot shelf and `/songs`. They already convert in-app data into SEO; we do too.
- **JOYSOUND my-age ranking** [V]. Era is the slice that *unites a group* ("what everyone our age knows"). We shouldn't ask anyone their age. Ask for a decade ("I grew up on…") per phone, then blend the decades across the room.
- **DAM みんなの声** [V]. Occasion/situation chips built from *what people actually sang*, not from editors. We can do this: tag rooms with an occasion chip, then learn which songs those rooms queue.
- **DAM per-country rankings for foreign visitors** [V]. Matches our Country picker. Extend it so a *mixed room* (phones on several locales) gets a shelf per top locale.
- **JOYSOUND 前回のカラオケ / DAM MYりれき** [V]. "Your songs from last time" as one-tap re-queue. We have no accounts, but the device has localStorage. This also helps the lost-room re-entry gap noted in the activation funnel memory.
- **JOYSOUND "easy to sing"** [V] + **StarMaker Hook** [R]. Low-commitment first songs. 0-song rooms are our biggest drop-off, so an Easy-first shelf has outsized value.
- **DAM CHANNEL** [S] + **KaraFun next-5 banner** [V]. The TV is a broadcast surface during downtime.
- **Spotify Jam attribution** [V]. "Added by Maya" builds social proof for the songs that went well.
- **Lucky Voice "Feeling Lucky?"** [V]. A randomizer with stakes (assign singer *and* song) is more fun than our plain 🎲.
- **Rockbot votes that don't reorder** (contrast Festify, which does) + **SongUp's fairness argument** [V]. Use votes as *signals*, never as queue order.

### 2.3 Things competitors do that we should NOT copy

- **Paywalled discovery.** It is the loudest complaint category: Yokee hits behind VIP, Singa's 3 songs/day, Smule's solo gate [R]. Free, good suggestions are our differentiator.
- **Engagement-optimized recommendations** (Smule: likes/shares/followers) produce "promoted accounts," and ignore the language people actually sing in [R].
- **LLM picks resolved live** (Queueoke AI DJ). It spends a search per pick and returns unvetted cuts. If we ever use an LLM, it maps a mood to *corpus keys*, or tags the corpus offline. It never triggers `search.list`.
- **Vote-ordered queues** (Festify, Queueoke). They break the fairness singers expect, and the host-controls rule.
- **Face/age camera detection** (DAM WAO!). It is creepy on a phone web app, and the decade chip does the same job.
- **Mic-based range detection.** It needs permissions and DSP, and isn't worth it for a party app (Vocal Match is a solo-app feature).

---

## 3. The white space, in one sentence each

1. **Room-aware ideas**: suggestions that change with what this room has queued. Nobody does this. [Every source]
2. **Tonight / near-you trending**: "most sung" scoped to the room, tonight, and the country this week. Today it exists only in venue dashboards.
3. **Ideas on the TV**: changeover and empty-queue prompts with a scan-to-add. Nobody does this.
4. **A first-timer path inside a party app**: easy crowd-pleasers for nervous singers.
5. **Group pairing**: duet matchmaking among people *in the same room*. Smule's duets are with strangers online.
6. **Country-aware defaults with no settings step.** We already do this (geo → Hot), and it is rare. Keep it.

---

## 4. Recommended features (concrete specs)

Ordered by value ÷ risk. Every item:
- **costs zero YouTube quota**, because it only reorders or filters corpus songs we can already serve;
- **keeps the serve-only-resolved invariant**: a candidate must have cuts before it renders;
- **follows the UI rulings**: ranked text rows only, no thumbnails, no sideways card rows, every tap opens the full versions list, and country always beats UI language.

### F1. "For this room" shelf: room-aware re-ranking ⭐ build first

**What:** a shelf at the top of the Hot tab, once the room has ≥2 queued or sung songs. It re-ranks the candidates we already compute (hot + rooms + classics for the room's country, plus F3 neighbours once those exist) using the room's own queue.

**Algorithm.** No ML. This is a two-stage "candidate sources → one hand-weighted score" design (the YouTube RecSys pattern, without the neural nets):
- **Hard filters:**
  - drop songs already queued or sung in this room (match on corpus key *or* videoId);
  - drop any artist that already appears twice tonight.
- **Affinity boosts**, computed from the room's last ~5 songs:
  - same language/script as the room's dominant language;
  - same decade;
  - same artist neighbourhood (F3);
  - same pack/section membership (e.g., room is singing `ph-classics` → boost that pack).
- **Diversity:** MMR-style greedy pick, `λ·score − (1−λ)·maxSim(to already-picked shelf items)`, where similarity is same artist / decade / section. Start with λ≈0.7.
- **Exploration:** reserve 1 slot in every 8 for a hot-chart or long-tail song, to stop the popularity feedback loop.
- **Mixed room** (DAM per-country pattern): if the queue has two strong language clusters, interleave them rather than picking the majority. Spotify Blend tested this and chose "maximize joy" over "least misery": serve each cluster's real favourites, not a bland middle [V].

**Data:**
- The room's queue (already loaded on the client in Sing/host). Do the re-rank **client-side**. The shared shelves stay CDN-cached exactly as now; we just filter and reorder them locally. No new endpoint, and no extra Vercel invocations (we are already over Hobby limits; self-host is in flight).
- Each idea row needs `decade`, `lang`, `artistKey`, `sections[]` in the shelf payload. Check what `IdeaShelf` already carries before adding fields.

**Copy:**
- Shelf heading: explanation-as-heading (the Spotify DJ pattern, minus the voice), e.g. "Because this room is singing {artist}" / "Keeping the {decade} going". All copy goes through `t()` with the 10-locale parity test.
- When the room has <2 songs, hide the shelf. Don't show an empty one.

**Rulings check:** this does not violate "no per-room history shelves". That ruling is about *persisting* features on data scheduled for deletion. This reads the live queue at render time and stores nothing.

**Metric:** `suggestion_used.suggestionSource = 'room'` (new enum value), plus share of adds from ideas (6% baseline) and tap→add within 5 min (63% baseline).

### F2. Time-scoped trending: "Tonight" / "This week in {country}"

**What:** change the rooms shelf from a flat 14-day window to tiers:
1. **"Sung in rooms tonight"**: last ~6h, own country.
2. **"This week in {country}"**: 7 days.
3. Fall back to the existing 14-day / language / world widening.

**Ranking:** a decayed score on **distinct rooms**, never raw adds. One PH room once produced the platform's #1. Use a Reddit-hot-style score: `log10(1 + distinctRooms) + recency`. It keeps the existing ≥2-rooms floor and adds **k ≥ 3 rooms** before showing any sub-country tier, so a sparse tier can't reveal what one specific room sang.

**Cost:**
- It is the same aggregation as today with a time bucket.
- Cache key `shelves:v4:{cc}:{lang}:{bucket}`, with a shorter TTL (~15 min) for the "tonight" tier only.
- Thin countries fall back silently to the chart. Never render "0 sung".

**Exclude** localhost/demo traffic (per the analytics-exemptions memory) and Anna's test rooms.

### F3. Cross-room co-occurrence: "Rooms that sang X also sang Y"

**What:** a nightly cron step builds `song_pairs { a, b, w }` from room queues:
- For each room, take the corpus songs in queue order.
- For each pair within 5 positions, add `1/distance` to w.
- Keep the top 50 neighbours per song, normalized (cosine or lift) so "Bohemian Rhapsody" doesn't become everyone's neighbour.

This is the method that **matched or beat neural session recommenders** in Ludewig & Jannach's benchmarks (Last.fm, 30Music, 8tracks), and it is how ListenBrainz builds "similar recordings" [V].

**Use:**
- A candidate source for F1: sum the neighbour lists of the room's last 3–5 songs, with recency decay.
- Also: after a guest adds a song, the ConfirmModal success state could offer "Rooms that sang this also sang…". This is the "next song" moment no competitor fills.

**Rulings check:**
- `song_pairs` is an *aggregate* derived from rooms. It holds no room ids and no video ids (corpus keys only), so it doesn't depend on room data surviving its 30-day expiry, and it doesn't hold YouTube-derived fields under the 30-day rule.
- **Still, confirm with Anna before building**, since it is adjacent to the "no room-history features" ruling.
- Apply the demo/localhost exemptions. The shared prod/dev DB will contaminate pairs otherwise.

**Cron:** add it as a resumable step with a `cron_state` cursor (the 300s Vercel cap; the measured harvest took 335s).

**Cold-start seeding (optional):** ListenBrainz similar-recordings (open data) can seed pairs for corpus songs before room data accrues. **Don't use Last.fm** (non-commercial ToS) or the Spotify Million Playlist Dataset (research-only). Both conflict with the sellable-platform goal.

### F4. Song tags: easy · duet · anthem · energy

**What:** four tags on `karaoke_songs`:
- `easy` (bool, or a difficulty of 1–3);
- `duet` (bool);
- `anthem` (crowd sing-along, bool);
- `energy` (1–3: ballad / mid / banger).

**How to fill them, cheapest first:**
1. **Heuristics.** For `duet`: "feat." / "&" / "duet" / "with" in the title, plus the existing Duets section. For `easy`: the Voice Type "easy-sing" list and JOYSOUND-style editorial picks.
2. **A one-off offline LLM pass over the corpus**, writing tags with an `origin: 'llm'` marker. This is an LLM classifying songs we already hold. It never discovers songs and never triggers search.
3. **Behavioural correction later:** songs often removed or skipped before finishing lose `easy`/`anthem`.

**Research grounding for `anthem`:** Pawley & Müllensiefen's pub/club field study (1,050 song events) found long detailed phrases, several pitch changes in the hook, male vocals, high-effort singing near the top of the range, and clear lyrics predicted crowd singing. Top predicted: "We Are the Champions", "YMCA". KaraFun's yearly lists split naturally into ballads / dancefloor / duets [V].

**Drives:**
- **"Easy first song" shelf.** Shown when this *guest* hasn't sung yet. Aimed straight at the 0-song-room drop-off.
- **Duet prompts.** When two guests in the room haven't sung recently, show "Grab {name} for a duet". Copy only; no matchmaking backend. This is the in-room duet pairing nobody does.
- **Night arc (soft prior only).** Use `Room.sessionEndsAt` (it already exists) and the queue ETA:
  - early in the night: easy and familiar songs;
  - middle: bangers;
  - last ~20 min: a "Last-call anthems" shelf.

  Never forced; it's a boost, not a filter.

### F5. Ideas on the TV during downtime

**What:** extend `DisplaySidebar` / the empty-stage state:
- **Queue empty or short** (≤1 song): rotate 3 ideas from F1/F2 ("Not queued yet? Try one of these") alongside the existing join QR. Each idea gets a short code or deep link that opens the versions list for that song on the guest's phone.
- **During changeovers:** show "Up next" plus one idea line. KaraFun's next-5 banner is the reference [V].

**Rulings:**
- Follow the Boards-surfacing pattern: broadcast on the Display, act on phones. Gate it behind a Display Customize toggle, like `boardsOnDisplay`.
- Host and display Customize must not drift (Anna's rule).
- TV performance: use the calm path / `--tv-scale`, and no motion (demo-fidelity and smart-TV memories).
- Data: reuse the shelves response the display can fetch once and cache. Don't add a polling endpoint; piggyback on the existing room poll.

**Why:** DAM CHANNEL proves the idle screen sells songs [S]. Nobody in the West does it.

### F6. Vibe / occasion / era chips

**What:**
- **Optional** one-row chips for the host (and any phone):
  - **Era**: 70s / 80s / 90s / 00s / 10s / Now.
  - **Occasion**: Birthday, Work party, Date night, Bachelorette, Holiday, Late night.
- Stored as `room.vibe` (host) and in device localStorage (guest).
- It reweights F1 until the room has ~5 songs. After that, room behaviour dominates. This mirrors Spotify's onboarding-signal phase-out.

**Per-phone era chips blended across the room** is the JOYSOUND my-age idea without asking anyone's age.

**Learning occasion lists from behaviour** (the DAM みんなの声 idea): rooms tagged "Birthday" feed a per-occasion co-occurrence (F3 keyed by occasion). Until there is data, seed each occasion with a short editorial list in a pack JSON.

**Free extra signal:** the room name. Keyword-match "birthday", "k-pop", "90s", "office" to chips. This is the Million Playlist Dataset lesson that titles predict content, done without ML.

**Caution:** the activation funnel says drop-off happens *after* room creation. **Never add a step to room creation.** Chips live inside the Hot tab, can be skipped, and are not modal.

### F7. Smaller wins

- **"Your songs from last time"**: device-local history (localStorage, try/catch) as one-tap chips at the top of Hot for returning devices. From JOYSOUND 前回のカラオケ.
- **Better 🎲.** Turn Surprise me into "Feeling lucky": pick from F1's top 20 rather than all categories, show it with a re-roll, and optionally a host-side "pick a random singer too" (Lucky Voice).
- **Voice filter on every shelf.** Move Voice Type from a tab into a persistent low / mid / high toggle that filters every shelf (the Vocal Match idea without the mic). It also means fewer tabs, which matches Anna's preference for merging tabs.
- **Attribution.** "Added by {name}" on TV queue rows (Spotify Jam). Check whether we already show it.
- **Chorus/"hook" framing** for nervous first-timers. This is copy only, unless we later find chorus timestamps.

---

## 5. Deferred: non-singer features (later round, per Anna)

Anna's direction (2026-10-24): **make suggestions great first**, then add the fun-for-non-singers features. Research for that round:
- **Dedicate a song to someone.** DAM★とも supports user-to-user requests [V]. A non-singer nominates a song for a named guest, and the guest gets one-tap accept-and-queue. Builds directly on the Suggestions board, which already converts at 61%.
- **"Pick the room's next vibe" poll** every ~4 songs. The Jackbox audience pattern: votes aggregated as a bloc, with a one-tap pass [V]. The result shifts F1 weights.
- **👍 / "I'd sing along" on queued songs.** Feeds F1/F3 as implicit ratings, and **never reorders the queue** (SongUp's argument; host-controls rule).
- **Hype reactions on the TV**, reusing CheerBar, as ratings. Apple Music Sing has emoji reactions [V].
- **Lyric quiz during changeovers** (KaraFun Music Quiz / Interlude) [V]. Big scope.
- **End-of-night recap.** The recap button was just reverted on main (`063e4be`), so check why before touching it.

---

## 6. Constraints and landmines (read before coding)

- **Serve-only-resolved.** No code path from a tap to `search.list`. Every new shelf candidate must have cuts.
- **Quota rule.** Quota is solved by demand reduction, never rationing. Every feature here is zero-unit by design; keep it that way.
- **No scraping YouTube; no copying competitor lists wholesale.** KaraFun/Singa charts are fine as *inspiration* for editorial picks typed into packs, not as a scraped feed.
- **YouTube 30-day rule.** YouTube-derived fields live only in `karaoke_videos`, under its TTL. New aggregates (`song_pairs`, tags) key on corpus song ids.
- **Rooms expire 30 days after last activity.** Don't persist per-room feature data. Live reads and anonymous aggregates are fine; still confirm F3 with Anna.
- **Shared prod/dev DB + demo traffic.** Exclude localhost/demo (`x-karaoq-demo:1`) and test rooms from every aggregate. Migrations go only through `cron_state`-guarded cron steps.
- **Vercel Hobby limits** (over on invocations; self-host branch in progress). Prefer client-side re-ranking of CDN-cached shelves over per-room endpoints.
- **ES5 target.** No `/u` regex literals, no Map-iterator spreads.
- **i18n.** All copy via `useT()`/`t()`, with parity across 10 locales.
- **No `lib/analytics` imports in components.** Analytics goes through the existing hooks.
- **CLAUDE.md.** Component files stay under ~300 lines; split shelves into `components/songsearch/` pieces; run `tsc` + vitest after each step.
- **UI rulings (rounds 2–7):**
  - one Hot tab with a Country picker;
  - ranked text rows, no thumbnails;
  - no sideways scrollers;
  - every tap → the full versions list;
  - country beats UI language;
  - the picker resets to home on each visit.

---

## 7. How to measure "best around"

Tag every surface with a distinct `suggestionSource` (`room`, `tonight`, `easy`, `duet`, `tv`, `lastTime`, `vibe`…) and compare against the 2026-10-24 baseline:

| Metric | Baseline | Target direction |
|---|---|---|
| Ideas share of adds | 6% (295/4,978) | ↑ (the headline number) |
| Idea tap → add within 5 min | 63% | ↑ for F1 vs the hot shelf |
| Shelf open → any tap | 61% (genre chips) | ↑ |
| Rooms with 0 songs | see activation funnel | ↓ with F4 easy-first + F5 TV |
| `fromCorpus=false` rate on idea adds | ~0 | stay ~0 (invariant) |

---

## 8. Sources

**Consumer apps**
- KaraFun features / Vocal Match: https://www.karafun.com/features/ · https://www.karafun.com/features/vocal-match.html
- KaraFun Remote: https://www.karafun.com/help/web_610.html · https://www.karafun.com/blog/1368-karafun-remote-control-update-enhanced-for-your-karaoke-parties.html
- KaraFun Quiz / Interlude: https://www.karafun.co.uk/blog/1670-the-karafun-music-quiz-the-feature-that-turns-an-evening-into-a-true-group-game.html · https://www.karafun.com/blog/1522-interlude-is-here-let-the-music-play-mid-quiz.html
- KaraFun charts: https://www.karafun.com/karaoke/playlist/global-top-100/ · https://www.karafun.com/blog/1479-karaoke-s-biggest-hits-of-2024-the-songs-that-defined-the-year-on-karafun.html
- KaraFun catalog requests: https://www.karafun.com/help/catalog_83.html · App Store (Automix notes, reviews): https://apps.apple.com/us/app/karafun-karaoke-battle-quiz/id431050674
- Singa Discover: https://help.singa.com/en/articles/9388797-how-does-the-singa-browser-app-work · What's new Mar 2026: https://help.singa.com/en/articles/13936210-what-s-new-march-2026 · Aug 2026: https://help.singa.com/en/articles/16388442-what-s-new-august-2026
- Singa Party Mode: https://singa.com/blog/introducing-party-mode-karaoke/ · https://help.singa.com/en/articles/14044990-how-to-use-singa-party-mode
- Singa Business: https://help.singabusiness.com/how-to-send-song-requests-to-singa-lite-venue · https://help.singabusiness.com/controlling-the-queue-and-song-requests · https://singa.com/blog/singa-app-benefits-for-venues/
- Singa most-sung charts: https://singa.com/blog/100-most-popular-karaoke-songs-united-states/
- Smule recommendation complaints: https://sing.salon/forums/topic/3493-how-are-recommended-songs-in-smule-selected/
- StarMaker: https://kentamplinvocalacademy.com/reviews/singing-apps/starmaker-sing-karaoke-songs/
- Yokee: https://apps.apple.com/us/app/yokee-karaoke-start-singing/id547109049 · https://unstar.app/blog/smule-starmaker-yokee-wesing-singa-karaoke-apps-ranked-2026
- Apple Music Sing: https://www.apple.com/newsroom/2022/12/apple-introduces-apple-music-sing/ · https://support.apple.com/en-gb/guide/tv/atvbd965bc0d/tvos · https://www.macrumors.com/2025/06/10/tvos-26-iphone-karaoke-mic-apple-music-sing/
- Sing King: https://singking.com/blog/sing-king-app-karaoke-game/
- Lucky Voice games: https://www.luckyvoice.com/blog/lucky-voice-karaoke-software-games
- Kanto: https://refreshmiami.com/news/meet-kanto-the-app-bringing-karaoke-to-your-living-room-stage/
- Queueoke: https://github.com/debugged-me/Queueoke
- Request-app comparison: https://requestsongs.co/compare-song-request-apps/

**Venue / KJ systems**
- DAM: https://www.clubdam.com/ · era/age search http://www.clubdam.com/generation/ · Denmoku みんなの声 https://www.clubdam.com/apps/denmokuapp/ · recommended key https://www.clubdam.com/tips/tips2306_2.html · face search https://www.clubdam.com/tips/tips2306_4.html · LIVE DAM WAO! https://prtimes.jp/main/html/rd/p/000001028.000014607.html · ranking battle https://www.clubdam.com/contents/saiten/rankingbattle.html · DAM CHANNEL https://ja.wikipedia.org/wiki/DAM%E3%83%81%E3%83%A3%E3%83%B3%E3%83%8D%E3%83%AB
- JOYSOUND: my-age ranking https://www.joysound.com/web/s/function/myage · features https://www.joysound.com/web/s/function · easy-to-sing https://www.joysound.com/web/s/karaoke/feature/singable · 分析採点 https://www.joysound.com/web/s/function/bunsekimaster · MAX services https://max.joysound.com/product/max/service.html · X1 https://news.mynavi.jp/article/20261016-5134431/
- TJ app: https://apps.apple.com/kr/app/id385262125 · KY: https://apps.apple.com/kr/app/id1546328671
- KaraFun Business: https://business.karafun.com/experiences/karaoke.html · https://business.karafun.com/solution/
- OpenKJ: https://github.com/OpenKJ/OpenKJ · RequestYourSong: https://www.requestyoursong.com
- Spotify Jam: https://newsroom.spotify.com/2023-09-26/spotify-jam-personalized-collaborative-listening-session-free-premium-users/
- Rockbot: https://rockbot.com/bars · TouchTunes: https://apps.apple.com/us/app/touchtunes-jukebox-music/id378351144 · Festify: https://getfestify.com · SongUp vs Festify: https://songup.tv/blog/posts/songup-vs-festify

**Techniques and research**
- Spotify Blend (maximize joy vs least misery): https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you
- Spotify DJ requests: https://newsroom.spotify.com/2025-05-13/dj-voice-requests/
- Masthoff group modeling: https://pro.unibz.it/projects/schoolrecsys17/JudithMasthoff.pdf · PolyLens: https://www.researchgate.net/publication/221553264_PolyLens_A_recommender_system_for_groups_of_user
- Session-based rec benchmarks (simple kNN/rules ≈ neural): https://arxiv.org/pdf/1803.09587 · https://arxiv.org/pdf/1910.12781
- ListenBrainz similar recordings: https://labs.api.listenbrainz.org/similar-recordings
- RecSys Challenge 2018 / MPD: https://arxiv.org/abs/1810.01520 · winner https://www.cs.toronto.edu/~mvolkovs/recsys2018_challenge.pdf
- YouTube two-stage recs: https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/
- MMR diversity: https://www.researchgate.net/publication/2269571_The_Use_of_MMR_Diversity-Based_Reranking_for_Reordering_Documents_and_Producing_Summaries
- Spotify audio-features API removal (Nov 2024): https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/
- Science of singing along (Pawley & Müllensiefen): https://www.researchgate.net/publication/259731527_The_Science_of_Singing_Along_A_Quantitative_Field_Study_on_Sing-along_Behavior_in_the_North_of_England
- Jackbox audience mode: https://jackbox.wiki/wiki/Audience
- HN / Reddit-hot ranking: https://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html
- Last.fm API ToS (non-commercial): https://www.last.fm/api/tos
