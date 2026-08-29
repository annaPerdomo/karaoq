# Hero demo video

The landing page hero stands a 20-second looping product film
(`public/demo/hero-demo.webm|mp4` + `hero-demo-poster.webp`) on its right-hand
stage, beside the pitch and the host form.

**The cast is one big screen and two guest phones.** The big screen is the
host's — the visitor filling in "Start a Room" to its left *is* the host, so the
film shows them what they'd be looking at rather than a third device competing
with the form. The phones are Anna's and Naomi's, and they are two so that
"guests add songs from their phones" reads as a room rather than as one person;
each does one distinct thing, so the two phones teach two capabilities instead
of repeating one. The rest of the room — Toby on stage, Pascal, Penny and
Wallace in the queue — never appears as a device, only as names in Up Next.

| beat | film time | what happens |
| --- | --- | --- |
| Ready | 0–2.4s (film time) | A stage that already exists: the note mark, the join code `X7K2M`, "no songs queued yet". One gold breath on the code; nothing else moves |
| Join | 2.4–4.9s | Anna's phone slides in, name gate ("Room X7K2M"), she's in |
| Guests | 5.0–5.7s | Naomi's phone slides in, already in the room — one join teaches the step, twice would just spend the runtime |
| Fill | 5.9–6.4s | Toby's and Pascal's songs land in Up Next |
| Live | 6.9–7.5s | Toby goes on stage; the screen's center flips to the song |
| Cheer | 8.6–11.4s | Naomi taps ❤️ → it floats up the big screen, and the room answers with a wave of its own |
| Add | 11.2–14.7s | Anna searches "golden", taps + → toast → "Anna – Golden" lands in Up Next |
| Duet | 14.9–16.1s | The Sing-together card lands on **both** phones; Anna joins Naomi's post → "Naomi & Anna – 🎤 Islands in the Stream" queues, pushing the oldest row out of the window |
| Reset | 16.4–20s | Calm room, the phones recede, the screen returns to the ready stage — the seam is also the opening |

Everything in frame is real product UI (fixture cast: room `X7K2M`, Toby on
stage, Pascal/Penny/Wallace queued, Anna and Naomi on the phones). The
film bakes in no marketing copy at all — the roles read from the UI itself, not
from labels — so one rendered file serves every locale, and the only words in
the hero are the translated ones in the DOM above it.

## Three rules the film is built around

**It never re-draws the page's own host form.** The hero already stands "Start
a Room" immediately to its left; the film used to open on a replica of that
card, type a name into it, press it and morph it into the big screen — about a
quarter of the runtime spent on a second copy of what the page was already
asking for. The film now opens *after* the press, on a stage that is already
live with a code on it, so the left of the hero asks and the right answers.

**One thing moves at a time.** The bezel, the header and the sidebar's
scan-to-join card never animate — they are the set, not events in it. The two
phones enter and leave on staggered beats, never together. Queue rows land only
in the gaps between the beats we're watching.

Cheers are the deliberate exception: they come in two waves — Naomi's tap and
the room answering it (9.0–11.4s), then a second wave over the duet payoff
(15.6–18.2s) — because a room that only ever produces one reaction doesn't look
like a room. They stay out of Anna's search (11.2–14.7s), the one stretch where
a stream of them would compete with the beat being watched, and they rise in a
right-edge lane that is clear of every lyric line at any height.

**It has no background.** See below — this is what lets it sit on the hero as
an object rather than a panel.

## Why the film is transparent

The film ships as **alpha video**. Its stage paints nothing, so the hero's
vertical ramp, its two radials, the swaying beams and `.stageGlow` all show
straight through, and only the TV and phones land on the page.

Two earlier approaches are worth not repeating:

- **A flat background matched to the hero's mid-tone** (`#181829`). Matching a
  single tone can't work, because the page behind the film isn't one tone — it
  is a ramp crossed by two radials and two moving beams. The film read as a
  dead, differently-coloured slab inside a lit room, and being opaque it also
  hid `.stageGlow`, which is painted *behind* it.
- **An all-black stage composited with `mix-blend-mode: screen`.** This does
  dissolve the rectangle perfectly, and needs no alpha channel. But `screen` can
  never produce anything darker than its backdrop, and the film's whole look is
  dark panels in a dark room: the TV's interior and both phone bodies came out
  milky, and every drop shadow vanished. (It also needs the blend and the mask
  on the *same* element, and `.heroInner`'s `z-index: 1` to go, since a stacking
  context anywhere above isolates the blend and the film returns as a black box.)

There is no single transparent-video format: Chromium and Firefox decode alpha
in VP9/WebM, WebKit only in HEVC/MP4 and ignores it in WebM. Both are shipped,
and `HeroStage.tsx` picks per engine — a capability probe rather than a UA
sniff, since `navigator.userAgentData` exists only in Chromium, which is the one
engine that might otherwise claim `hvc1` support and then drop the alpha. Plain
`<source>` ordering can't express this, and picking wrong fails silently: the
film simply comes back opaque.

There is also **no page-side mask any more**. With real alpha the objects'
shadows and glows fade out on their own, and the feathered ellipse that used to
hide the rectangle was dimming the right edge of the guest phone. What replaced
it is a narrow feather on `.stage` *inside the film* — the devices' drop
shadows are wider than the margins left for them, and a clipped shadow is a
hard edge in the alpha channel. That feather is baked into the frames, so it
only has to work in the capture browser.

## How it's made

The film is **not** a screen recording. `/demo/hero-video`
(`components/herovideo/`) renders the whole 20s as a pure function of `t`:

- `timeline.ts` — every beat, easing and fixture as data, including `GUESTS`,
  which carries each phone's placement, scale and entry/exit beside the times
  it acts on.
- `BigScreen` / `GuestPhone` — replicas of the real app chrome (Display-style
  big screen with the empty-stage waiting state, Sing-style phones), styled by
  `styles/HeroVideo.module.css` at 2× so the master reads at ~700–850px wide.
  `GuestPhone` takes a `GuestSpec`, so the two phones are one component.
- `HeroVideoStage` — the 1200×770 canvas. Modes:
  `/demo/hero-video` (live loop) · `?t=<ms>` (hold a frame) ·
  `?capture=1` (frozen and transparent; `window.__kqHeroSeek(ms)` drives the
  clock). Under `?capture=1` nothing may paint a background — page, body or
  wrapper — or the alpha channel fills in and the rectangle comes back.

Adding a third device didn't widen the canvas (that would only render
everything smaller on the page — the film renders at *stage width ÷ canvas
width*, so a wider canvas is a smaller film). The TV gives up 12% and the
phones 10%.

Canvas **height**, by contrast, is free: it doesn't touch the scale, it only
decides how tall the film's box is. So the canvas is cropped to 770 rather than
900 — dead canvas was dead resolution, and the shorter box is what keeps a
962–1104px stage from towering over the fold.

The size lever that actually mattered was on the page, not in the film:
`.heroInner` was capped at `1560px` while the copy track is fixed at 40rem, so
every pixel that cap gives back lands on the stage. At 1800px the film gets
~910px on a 1720px screen instead of 864px, and 1120px once the viewport clears
2000px — the desktop margins were simply going unused.

The gutter is the counterweight. `.hero` and `.nav` share
`clamp(2rem, 4vw, 5.5rem)`, so a wide screen keeps a real margin instead of
running the headline up against the edge (a flat 2rem left it 32px from it at
1720px). The nav matches the hero so the logo stays on the headline's line, and
the grid's `column-gap` is 2.5rem rather than 3.5rem to hand some of the gutter
back to the stage — the copy track's longest headline line is 601px inside
640px, so it already ends in air.

Two sizing rules the layout has to respect:

- **Every device must clear the canvas feather.** It is 1.2% (14px) a side, and
  anything overlapping it comes out soft. The TV once sat at `x: 6` under a 4%
  feather and its whole left edge rendered blurred on the page. The devices'
  drop shadows are trimmed to suit, so a thin feather is all that's needed.
- **The lyrics are sized against the page, not against the TV.** At 29px they
  read as a second headline competing with the hero's own; 24px sits them back
  down into the film.

The sidebar shows four rows and the night has six songs, so the list runs
deeper than it can show — the oldest row slides out as a new one lands (the
count pill keeps showing the true depth). That is what a real queue does, and
it is also how the whole cast gets on screen.

Because every frame is seekable, the capture is deterministic and the loop
seam is exact: frame 600's state *is* frame 1's state (verified pixel-equal).

### How the seam closes

The room ends the loop full of songs and starts it empty, and nothing may be
seen rewinding. Both halves of the reset are **sequenced swaps, never
cross-fades** — a cross-fade here ghosts the join code through the lyrics:

- The empty stage's *wash* is the stage's own lighting and never fades; only
  the note mark and the code do. That's what keeps the handoff from flashing a
  bare panel between the song leaving and the empty stage returning.
- The queue's rows leave as one group before the empty state comes back, rather
  than emptying row by row in view.
- `.tvQueueTitle` reserves the count pill's height. The pill is
  present-but-transparent at the end of the loop and absent at the start, and
  without that reservation the whole sidebar list shifts 3px across the seam.

## Regenerating the assets

Scripts live in `video/hero-demo/` (the `video/` dir is gitignored but
persistent, like the promo pipelines):

```bash
PORT=3010 pnpm dev                     # any port; scripts honor KQ_BASE
node video/hero-demo/capture.mjs       # 600 transparent PNGs at 2400×1800 (~2min)
bash video/hero-demo/build.sh          # → public/demo/hero-demo.{webm,mp4}, poster
```

- `capture.mjs` uses `video/node_modules/playwright-core` + the cached
  Chromium under `~/Library/Caches/ms-playwright` (override with `KQ_CHROME`),
  and shoots with `omitBackground` so the frames carry a real alpha channel.
- Frames land in `/tmp/kq-hero-frames` (`KQ_FRAMES`), **outside the repo on
  purpose**: Next's dev server watches the project tree, and dropping 600 PNGs
  into it mid-capture triggers recompiles that reload the very page being
  captured. `build.sh` reads the same default. For the same reason both scripts
  wait on the film's own `__kqHeroReady` flag rather than `networkidle` (which
  never settles against an HMR channel) and re-arm after a reload — including
  an epoch check *after* each screenshot, since a reload that lands mid-shot
  writes a blank white page without throwing. A long-lived dev server can fall
  into a reload loop that makes capture impossible; start a fresh one on its own
  port rather than debugging it.
- `build.sh` encodes VP9+alpha (crf 36, and `-auto-alt-ref 0` — libvpx silently
  drops the alpha plane without it) and HEVC+alpha via VideoToolbox (`hvc1`, not
  `hev1`, or WebKit won't play it), both at 1200×770/30fps, and pulls the poster
  from the payoff frame (`f0505.png`, ~t=16.8s) through `cwebp`, since homebrew
  ffmpeg has no webp encoder.
- **The HEVC must be premultiplied** (`premultiply=inplace=1` in its filter
  chain). WebKit composites HEVC alpha as premultiplied — `out = C + (1−a)·bg`
  — while the captured PNGs, the VP9/WebM (which Chromium composites straight)
  and the poster all carry straight alpha. Encode the straight color unchanged
  and every low-alpha pixel renders at full brightness on iOS: the phones' soft
  purple glow shadow came out as an opaque pink/purple ring around them, while
  desktop (WebM) looked fine.
- **Judge the HEVC in WebKit, never by decoding it with ffmpeg.** ffmpeg mangles
  the alpha-layered HEVC on the way back in, and the ringing it shows is its own
  — the shipped file is clean. The damage below ~`-q:v 40` *is* real, though:
  at `-q:v 24` the sidebar and phone chrome smear badly. `-q:v 48` is the
  smallest setting that still reads clean (~1.2MB; `-q:v 55` costs 1.6MB for no
  visible gain). VideoToolbox's rate control is erratic here — `-b:v` is close to
  ignored, and `du -h`'s rounding makes the `-q:v` curve look non-monotonic when
  it isn't. Compare exact byte counts.
- `preview.mjs <ms> …` renders single stills for design checks, into
  `/tmp/kq-hero-preview` (`KQ_OUT`). They are transparent — composite them over
  a dark ground to judge them.

After changing the film, re-run capture + build and re-verify:
`npx tsc --noEmit -p tsconfig.json && pnpm exec vitest run`, then eyeball the
loop seam (`preview.mjs 0 19966` should produce identical images) **and check
both engines** — a wrong source pick is silent.

## Page integration

`components/home/HeroStage.tsx` — the film as the lit object on the hero's
stage, not a framed panel and not wallpaper:

- `<video autoPlay muted loop playsInline preload="metadata">` with the source
  chosen per engine (above) and the poster behind it.
- SSR and `prefers-reduced-motion` render the poster `<img>` instead — the
  film's most informative frame, same convention the frozen mockup used.
- The film has **no container at all** — no border, radius, plate or shadow.
  What bounds it is light falling off: `.stageGlow` blooms behind (and now
  through) it, and `.stageFloor` is the pool it stands in.
- Grid order is pitch → stage → form, so stacking under 1280px puts the film
  between them: a phone visitor sees what KaraoQ is before it asks for a name.
- `.beamA`/`.beamB` (stage beams) and `.spotPool` (the follow-spot behind the
  copy) are CSS-only and strike after the headline, at 2.3s/3s/3.9s. On
  desktop the stage comes up last, at 6.2–6.7s; stacked under 1280px it sits
  between pitch and form, so it lights at 2.2–2.7s instead — right on the
  first beam strike, straight after the pitch cascade (title → sub → resume
  banner → host card). `REVEAL_MS_*` in `HeroStage.tsx` starts playback on the
  same beat as `.stageFilm`'s delay for each layout.
