# karaoq — Feature Ideas

Brainstorm of candidate next features, grouped by theme. Each idea notes what it
is, why it helps karaoq stand out, what existing code it builds on, and a rough
size (S/M/L). The goal of this doc is to pick a shortlist and turn the winners
into detailed prompts in `prompts/`.

Stage tags map to the product vision: **[party]** friends/POC polish,
**[organizer]** recurring-host tooling, **[venue]** sellable bar/venue platform.

---

## 1. Display customization (your idea — and the biggest open surface)

The display screen (`components/Display.tsx`) is currently 100% fixed-layout:
the only controls are fullscreen and language. Everything below is greenfield.

### 1.1 Display layout & content controls — S/M · [organizer] [venue]
Host-side panel (natural home: the gear popover or a new "Display" tab) that
controls what the TV shows and how big:

- **QR card size**: large / normal / small / hidden. Exactly your use case —
  a projector across a bar needs a poster-sized QR; a 32" TV in a living room
  where everyone already joined needs none.
- **Content toggles**: show/hide up-next list, now-playing bar, reactions
  overlay, footer credit.
- **Up-next depth**: how many entries the sidebar shows (currently hardcoded
  cap of 8).
- **Sidebar position**: left / right / bottom strip / overlay-only.

Mechanically cheap: add a `displayConfig` object to the `Room` model, host
writes it, display already polls every 1.5s so it picks changes up near-live.
No new realtime plumbing. This is also the foundation the venue features below
stack on.

### 1.2 Display themes & venue branding — M · [venue]
Preset themes (neon, minimal, classic dive-bar, clean/corporate) plus, for
venues: upload a logo, set an accent color, custom welcome line ("Tuesdays at
Moe's — tip your bartender"). This is the single clearest **paid-tier hook**:
"your bar's name on the big screen" is what a venue actually pays for. README's
roadmap already lists venue branding as unbuilt.

### 1.3 Idle / attract mode — S/M · [venue] [organizer]
When nothing is playing, the display currently shows a static "waiting for
singers" state. Replace with a rotating attract loop: giant QR + "scan to
sing", trending-tonight songs (per-room data already exists in analytics),
recent cheers, "12 singers so far tonight". A screen that sells the room to
people walking past is something no queue app's competitors do well, and it
directly attacks the 0-song-room activation problem — the screen itself nags
people to add the first song.

### 1.4 Second-screen singer view (lyrics-free stage banner) — S · [party]
In `here` mode the display already shows an "on stage / up next" banner. Extend
it: big countdown ("You're up in 2 songs, Anna!"), name pronunciation blurb,
singer-chosen emoji/flair. Cheap delight, makes the TV feel alive between songs.

---

## 2. Queue fairness & flow (the host's real pain at scale)

### 2.1 Round-robin / fair-queue mode — M · [organizer] [venue]
Toggle that interleaves singers so one enthusiastic person can't stack five
songs in a row. Server-side ordering rule over the existing `queue[]` (group by
`userName`, rotate). This is the #1 complaint about every casual karaoke night
and a known gap (README roadmap). Differentiator: most competitor apps make the
host police this manually.

### 2.2 Singer's-choice hold slot ("park a song") — S · [party] [organizer]
Let a singer mark their queued song "not yet / I need a drink first" — it holds
its place visually but the host's Next skips it until unparked. Removes the
awkward "they're in the bathroom" dead air without the host deleting anyone.

### 2.3 Estimated wait times — S · [party]
Show each singer "~18 min until you're up" (sum of remaining video durations —
YouTube search results already return duration metadata, or fall back to a
3.5-min average). Tiny feature, huge perceived polish; keeps singers from
leaving because they don't know when they're up. This is retention for the
exact drop-off window the activation funnel shows.

### 2.4 Encore / crowd voting — M · [party] [venue]
After a performance, guests get a 30-second "🔥 encore?" vote; enough votes
offers the singer an immediate repeat or bumps their next song up. Builds on
the existing reactions pipeline (`reactions[]`, cheer cooldowns). Turns the
audience from spectators into a game — very shareable, very "this app is fun"
in a way competitor queue managers aren't.

---

## 3. Activation & re-entry (attacking the funnel data directly)

### 3.1 First-song nudge flow — S · [party]
Analytics show the drop-off is post-room-creation: rooms with 0 songs.
When a room is 2+ minutes old with an empty queue, the host screen offers
one-tap seeds: "Add a crowd-pleaser to break the ice" (pull from trending +
regional packs already in `songSuggestions.ts`). Judge success by song-add
rate — the metric is already tracked (`song_added`).

### 3.2 Room recovery / "find my room" — S · [party] [organizer]
Duplicate-room pairs in analytics hint at hosts losing their room and creating
a new one. `lib/lastRoom.ts` already remembers the last hosted room on the
landing page — extend it: a recovery banner when creating a room while an
active one exists ("You have a room from 40 min ago with 12 songs — resume
instead?"), and same-device singer re-entry to their last room.

### 3.3 Post-night recap link — M · [organizer]
When a room winds down, generate a shareable recap: songs sung, top cheered
performance, singer count, "night MVP". Data already lives in `queue`/history +
reactions + analytics. This is the growth loop: the recap gets posted to the
group chat, and every recap is a karaoq ad with a "host your own night" CTA.

---

## 4. Venue / organizer platform (the sellable layer)

### 4.1 Persistent venue rooms + recurring nights — M/L · [venue]
A claimable permanent code (`karaoq.com/sing/moes-bar`) instead of a 30-day-TTL
random code, with a standing printed QR on tables. Pairs with a schedule
("karaoke every Thursday 8pm") and the attract mode (1.3) between events. This
is the structural shift from "a room" to "a venue" and the prerequisite for
charging anyone.

### 4.2 Organizer dashboard — M · [organizer] [venue]
Per-host history across rooms: nights hosted, singer counts, most-sung songs,
busiest hours. The analytics collection already records nearly all of this —
it's an aggregation + a page, not new instrumentation. For the portfolio story
it also demonstrates the data layer paying off.

### 4.3 Tip jar / singer shout-outs — M · [venue]
Venue configures a tip link (Venmo/PayPal/Stripe link — no payment processing
on our side); display shows it subtly, singers can attach a shout-out to a tip.
Zero-liability revenue feature venues genuinely ask for.

### 4.4 Song blocklist / content controls — S · [venue]
Host/venue can ban specific videos or keywords ("no 10-minute songs", explicit
filter via YouTube metadata). Trivial to build on the existing add-song server
action; table-stakes for a bar deployment, absent in hobby competitors.

---

## 5. Singer delight & social (compounding what SocialBoards started)

### 5.1 Duet matchmaking upgrade — M · [party]
"Sing Together" already auto-queues when min singers join. Add a browsable
"looking for a duet partner" spotlight on the display screen between songs, so
matching happens through the TV, not just the phone. Makes the social boards
visible to the whole room instead of only people who found the tab.

### 5.2 Personal song history & favorites — M · [party] [organizer]
Device-local (no auth needed): "you've sung these 14 songs across 3 nights",
one-tap re-add, favorites list that follows you into any room. Solves the
universal "what did I sing last time that killed?" problem. Later becomes the
carrot for optional accounts.

### 5.3 Key/tempo helper links — S · [party]
On any queued song, offer alternate-version search shortcuts: "lower key",
"female key", "acoustic", "with lyrics" (just re-runs the YouTube search with
modifiers via the existing search proxy). Cheap, and it's the kind of
karaoke-native detail generic queue apps never have.

### 5.4 Per-room "hot tonight" board — S · [party]
Room-scoped trending: most-cheered performances and most-added artists tonight,
shown on the social boards and/or display idle mode. The trending
infrastructure (`suggestion_cache`, song_added analytics) already does this
globally/per-country; scoping to a room is a small query.

---

## Suggested shortlist to prompt-ify first

If I had to pick the order:

1. **1.1 Display layout & content controls** — your instinct is right: biggest
   open surface, cheap to build, and 1.2/1.3 stack on it later.
2. **2.1 Round-robin queue mode** — the most-wanted host feature in any
   karaoke tool; clear differentiator.
3. **3.1 + 3.2 activation fixes** — small, and they attack the measured
   drop-off with a metric already in place to judge them.
4. **2.3 Estimated wait times** — tiny effort, disproportionate polish.
5. **1.3 Idle/attract mode** — the "wow" feature for demos, portfolio, and the
   venue pitch, once 1.1 exists.

Deliberately later: 4.1 persistent venue rooms (needs auth/claiming decisions),
5.2 favorites (bigger payoff once there are repeat nights to remember).
