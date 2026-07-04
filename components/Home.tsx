import { useRouter } from 'next/router';
import * as React from 'react';
import getRoom from '../app/queue/getRoom';
import {
  clearLastHostedRoom,
  getLastHostedRoom,
  rememberLastHostedRoom,
} from '../lib/lastRoom';
import styles from '../styles/Home.module.css';

// ─── FAQ content ───
// Exported so the landing page can mirror it in FAQPage structured data.
// Google requires the JSON-LD text to match the visible answers, so keep both
// sourced from here.
export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Is KaraoQ free to use?',
    answer:
      'Yes. KaraoQ is free to host and free to join. Songs play from YouTube, so there is nothing to buy or rent.',
  },
  {
    question: 'Do I need to download an app?',
    answer:
      'No downloads and no installs. KaraoQ runs entirely in your web browser on phones, tablets, laptops, and smart TVs.',
  },
  {
    question: 'What equipment do I need to host karaoke night?',
    answer:
      'A device with a browser and something that makes sound — a laptop or iPad on its own is enough. For a bigger night, put the video on a TV by casting or plugging in with HDMI. No karaoke machine or microphones required.',
  },
  {
    question: 'How do I get the karaoke video on my TV?',
    answer:
      'Cast your screen with AirPlay or Google Cast, or connect your laptop to the TV with an HDMI cable. KaraoQ can also pop the video out into its own window, so the TV shows the song and lyrics while the controls stay on your screen.',
  },
  {
    question: 'Do my guests need an account to sing?',
    answer:
      'No sign-up is required for anyone. Guests scan a QR code or enter the room code, then start adding songs from their own phones.',
  },
  {
    question: 'How do guests join the karaoke session?',
    answer:
      'Create a room to get a short join code and QR code. Share either one, and guests can search YouTube and queue songs from their phones in seconds.',
  },
  {
    question: 'Where do the karaoke songs come from?',
    answer:
      'Every song streams from YouTube, so you have millions of karaoke tracks, lyric videos, and instrumentals to choose from — no separate karaoke library needed.',
  },
  {
    question: 'Can I use KaraoQ at a bar, party, or venue?',
    answer:
      'Absolutely. Cast the queue to any screen and let guests add songs from their phones. It works just as well for house parties, team events, and venue karaoke nights.',
  },
];

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Scroll reveal wrapper ───
function Reveal({ children, className, delay }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.revealVisible : ''} ${className || ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// ─── Equalizer bars decoration ───
function EqBars({ color }: { color: string }) {
  return (
    <div className={styles.eqBars} aria-hidden="true">
      {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
        <span key={i} className={styles.eqBar} style={{ animationDelay: `${d}s`, background: color }} />
      ))}
    </div>
  );
}

// ─── Animated Demo: start a room now, come back to it later (the host) ───
// Runs on a laptop frame — the recommended host setup (see the Setup guide),
// and it keeps the step devices honest: laptop (host) → phones (guests) →
// big screen. Beat 1 mirrors the landing host panel (a name and one button);
// beat 2 the host's "Your stage is ready" screen (Host.tsx empty state);
// beat 3 the resume banner a returning host sees — the room isn't lost.
function StartResumeDemo() {
  return (
    <div className={styles.demoScreen} aria-hidden="true">
      <div className={`${styles.demoFrame} ${styles.srFrame1}`}>
        <div className={styles.srScreenBg}>
          <div className={styles.demoLogo}>KaraoQ</div>
          <div className={styles.srPanel}>
            <div className={styles.srNameInput}>Alex</div>
            <div className={`${styles.srPrimaryBtn} ${styles.srStartPress}`}>Start a Room</div>
            <div className={styles.srTextToggle}>Use a custom room code</div>
          </div>
        </div>
      </div>

      <div className={`${styles.demoFrame} ${styles.srFrame2}`}>
        <div className={styles.srScreenBg}>
          <div className={styles.demoMiniHeader}>
            <span className={styles.demoHeaderLogo}>KaraoQ</span>
            <span className={styles.demoBadge}>X7K2M</span>
          </div>
          <div className={styles.srCols}>
            <div className={styles.srStage}>
              <div className={styles.srStageTitle}>Your stage is ready</div>
              <div className={styles.srStageLede}>
                Add the first song and start singing &mdash; guests can pile
                on anytime.
              </div>
              <div className={styles.srAddBtn}>+ Add the first song</div>
            </div>
            <div className={styles.srInvite}>
              <div className={styles.srInviteQr} />
              <div className={styles.srInviteInfo}>
                <span className={styles.srInviteKicker}>Scan, or visit karaoq.live</span>
                <span className={styles.srInviteCode}>X7K2M</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.demoFrame} ${styles.srFrame3}`}>
        <div className={styles.srScreenBg}>
          <div className={styles.demoLogo}>KaraoQ</div>
          <div className={styles.srResumeCard}>
            <span className={styles.srResumeDot} />
            <span className={styles.srResumeText}>
              Your room <strong>X7K2M</strong> is still open &mdash; 6 songs
              queued
            </span>
            <span className={`${styles.srResumeBtn} ${styles.srResumePress}`}>
              Resume hosting
            </span>
          </div>
          <div className={styles.srPanelDim}>
            <div className={styles.srNameInput}>Alex</div>
            <div className={styles.srPrimaryBtn}>Start a Room</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Demo: the queue-building loop on a guest's phone ───
// One persistent Sing-view screen (header, search, the shared Up Next queue —
// mirrors Sing.tsx/SongSearch.tsx). The motion is the state changing the way
// it really does: type → results → tap + → toast, and the song lands in the
// queue. A beat later someone ELSE's song lands too — no interaction on this
// phone, because the queue is shared and live.
function QueueBuildDemo() {
  return (
    <div className={styles.demoScreen} aria-hidden="true">
      <div className={styles.demoAppBg}>
        <div className={styles.demoMiniHeader}>
          <span className={styles.demoHeaderLogo}>KaraoQ</span>
          <span className={styles.demoBadge}>Room: X7K2M</span>
        </div>
        <div className={styles.demoSearchRow}>
          <div className={styles.demoSearchInput}>
            <span className={styles.demoTyping}>golden</span>
          </div>
          <div className={`${styles.demoSearchBtn} ${styles.qbSearchPress}`}>Search</div>
        </div>

        <div className={styles.qbStage}>
          {/* Pre-search rest state: the real discovery grid, condensed. */}
          <div className={styles.qbDiscovery}>
            <div className={styles.qbCatGrid}>
              <div className={styles.qbCat}>
                <span className={styles.qbCatEmoji}>&#128293;</span>
                <span className={styles.qbCatName}>Crowd Pleasers</span>
              </div>
              <div className={styles.qbCat}>
                <span className={styles.qbCatEmoji}>&#127908;</span>
                <span className={styles.qbCatName}>Power Ballads</span>
              </div>
              <div className={styles.qbCat}>
                <span className={styles.qbCatEmoji}>&#128191;</span>
                <span className={styles.qbCatName}>90s &amp; 2000s</span>
              </div>
              <div className={styles.qbCat}>
                <span className={styles.qbCatEmoji}>&#127928;</span>
                <span className={styles.qbCatName}>Rock Classics</span>
              </div>
            </div>
            <div className={styles.qbSurprise}>&#127922; Pick a random song for me</div>
          </div>

          {/* Search results, with the + being tapped. */}
          <div className={styles.qbResults}>
            <div className={styles.demoResultCard}>
              <div className={styles.demoThumb} />
              <div className={styles.demoResultInfo}>Golden - Karaoke Version</div>
              <div className={`${styles.demoAddBtn} ${styles.qbAddTap}`}>+</div>
            </div>
            <div className={styles.demoResultCard}>
              <div className={styles.demoThumb} />
              <div className={styles.demoResultInfo}>HUNTR/X - Golden (Lyrics)</div>
              <div className={styles.demoAddBtnDim}>+</div>
            </div>
            <div className={styles.demoResultCard}>
              <div className={styles.demoThumb} />
              <div className={styles.demoResultInfo}>Golden - Acoustic Karaoke</div>
              <div className={styles.demoAddBtnDim}>+</div>
            </div>
          </div>

          {/* The confirmation the app really shows after adding. */}
          <div className={styles.qbToast}>Added &ldquo;Golden&rdquo; to the queue!</div>
        </div>

        {/* The shared queue stays on screen; songs land in it live. */}
        <div className={styles.qbQueue}>
          <div className={styles.qbQueueHead}>
            Up Next
            <span className={styles.qbBadge}>
              <span className={styles.qbCount1}>1</span>
              <span className={styles.qbCount2}>2</span>
              <span className={styles.qbCount3}>3</span>
            </span>
          </div>
          <div className={styles.demoQueueRow}>
            <span className={styles.demoQueueNum}>1</span>
            <div>
              <div className={styles.demoQueueSinger}>Jordan</div>
              <div className={styles.demoQueueSong}>Mr. Brightside</div>
            </div>
          </div>
          <div className={`${styles.demoQueueRow} ${styles.qbRowYours}`}>
            <span className={styles.demoQueueNum}>2</span>
            <div>
              <div className={styles.demoQueueSinger}>Sarah</div>
              <div className={styles.demoQueueSong}>Golden</div>
            </div>
          </div>
          <div className={`${styles.demoQueueRow} ${styles.qbRowFriend}`}>
            <span className={styles.demoQueueNum}>3</span>
            <div>
              <div className={styles.demoQueueSinger}>Diego</div>
              <div className={styles.demoQueueSong}>Sweet Caroline</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Demo: the big-screen payoff (Display view) ───
// The two states the room actually sees, in sequence: "UP NEXT" calling the
// singer to the stage, then the song starting — lyrics light up, the crowd's
// reactions float by, and the sidebar queue advances (Mike's row leaves, the
// count ticks down). Mirrors Display.tsx.
function BigScreenDemo() {
  return (
    <div className={styles.demoScreen} aria-hidden="true">
      <div className={styles.dpRoot}>
        {/* Video area: between songs → song playing */}
        <div className={styles.dpMain}>
          <div className={styles.dpReady}>
            <div className={styles.dpReadyTag}>UP NEXT</div>
            <div className={styles.dpReadySinger}>Mike</div>
            <div className={styles.dpReadySong}>Don&apos;t Stop Believin&apos; (Karaoke Version)</div>
          </div>
          <div className={styles.dpPlaying}>
            <span className={styles.dpYtBadge}>
              <span className={styles.dpYtPlay} /> YouTube
            </span>
            <div className={styles.dpLyrics}>
              <span className={`${styles.dpLyricLine} ${styles.dpSweep1}`}>Just a small town girl</span>
              <span className={`${styles.dpLyricLine} ${styles.dpSweep2}`}>Livin&rsquo; in a lonely world</span>
              <span className={`${styles.dpLyricLine} ${styles.dpSweep3}`}>She took the midnight train</span>
            </div>
            <div className={styles.dpReactions}>
              <span className={`${styles.dpReaction} ${styles.dpRe1}`}>{'\u{1F525}'}</span>
              <span className={`${styles.dpReaction} ${styles.dpRe2}`}>{'\u{1F44F}'}</span>
              <span className={`${styles.dpReaction} ${styles.dpRe3}`}>{'\u{1F929}'}</span>
              <span className={`${styles.dpReaction} ${styles.dpRe4}`}>{'\u{1F64C}'}</span>
            </div>
            <div className={styles.dpProgress}>
              <span className={styles.dpProgressFill} />
            </div>
            <div className={styles.dpNowBar}>
              <span className={styles.dpNowDot} />
              <span className={styles.dpNowLabel}>ON STAGE</span>
              <span className={styles.dpNowSinger}>Mike</span>
              <span className={styles.dpNowSong}>Don&apos;t Stop Believin&apos;</span>
            </div>
          </div>
        </div>
        {/* Sidebar: scan-to-join + the live queue that advances on play */}
        <div className={styles.dpSidebar}>
          <div className={styles.dpQr}>
            <div className={styles.dpQrCode} />
            <span className={styles.dpQrLabel}>SCAN TO JOIN</span>
            <span className={styles.dpQrText}>X7K2M</span>
          </div>
          <div className={styles.dpQueue}>
            <div className={styles.dpQueueTitle}>
              Up Next
              <span className={styles.dpQueueBadge}>
                <span className={styles.dpCount4}>4</span>
                <span className={styles.dpCount3}>3</span>
              </span>
            </div>
            <div className={`${styles.dpQueueItem} ${styles.dpRowLeaving}`}>
              <span className={styles.dpQueueNum}>1</span>
              <div className={styles.dpQueueInfo}>
                <div className={styles.dpQueueSinger}>Mike</div>
                <div className={styles.dpQueueSong}>Don&apos;t Stop Believin&apos;</div>
              </div>
            </div>
            {[
              { a: '2', b: '1', singer: 'Sarah', song: 'Golden' },
              { a: '3', b: '2', singer: 'Jordan', song: 'Mr. Brightside' },
              { a: '4', b: '3', singer: 'Priya', song: 'Levitating' },
            ].map((row) => (
              <div key={row.singer} className={styles.dpQueueItem}>
                <span className={styles.dpQueueNum}>
                  <span className={styles.dpNumA}>{row.a}</span>
                  <span className={styles.dpNumB}>{row.b}</span>
                </span>
                <div className={styles.dpQueueInfo}>
                  <div className={styles.dpQueueSinger}>{row.singer}</div>
                  <div className={styles.dpQueueSong}>{row.song}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── A single phone running the real search-and-add flow ───
// Mirrors SongSearch.tsx (room badge → search → results with a + to queue).
// Used a couple of times in the hero to show "anyone can add from any phone".
// When `toast` is set, the phone plays the real add interaction on a loop:
// the + gets tapped, results clear, and the app's confirmation toast shows —
// timed so the song lands in the shared queue on the TV a beat later.
function HeroPhoneCard({
  search,
  results,
  toast,
  className,
}: {
  search: string;
  results: { title: string; tapped?: boolean }[];
  toast?: string;
  className?: string;
}) {
  return (
    <div className={`${styles.heroPhone} ${className || ''}`}>
      <div className={styles.heroPhoneBody}>
        <span className={styles.hpNotch} />
        <div className={styles.hpHeader}>
          <span className={styles.hpBrand}>KaraoQ</span>
          <span className={styles.hpRoom}>X7K2M</span>
        </div>
        <div className={styles.hpSearchRow}>
          <span className={styles.hpSearchInput}>{search}</span>
          <span className={styles.hpSearchBtn}>Search</span>
        </div>
        <div className={styles.hpStage}>
          <div className={`${styles.hpResults} ${toast ? styles.hpResultsCycle : ''}`}>
            {results.map((r, i) => (
              <div key={i} className={styles.hpResult}>
                <span className={styles.hpThumb} />
                <span className={styles.hpTitle}>{r.title}</span>
                <span
                  className={
                    r.tapped ? `${styles.hpAdd} ${styles.hpAddTap}` : styles.hpAddDim
                  }
                >
                  +
                </span>
              </div>
            ))}
          </div>
          {toast && <div className={styles.hpToast}>{toast}</div>}
        </div>
        {/* The Sing view's bottom drawer handle — who's on stage + the live
            queue count, which ticks up when the song lands. */}
        <div className={styles.hpDrawer}>
          <span className={styles.hpDrawerDot} />
          <span className={styles.hpDrawerNow}>Mike &middot; Don&apos;t Stop Believin&apos;</span>
          <span className={styles.hpDrawerBadge}>
            <span className={styles.hpBadgeA}>3 up next</span>
            <span className={styles.hpBadgeB}>4 up next</span>
          </span>
        </div>
        <span className={styles.hpHomeBar} />
      </div>
    </div>
  );
}

// ─── The second phone: cheering the singer on ───
// Mirrors the Sing view while a song plays — Now Playing card + CheerBar
// (real emoji set and quick messages). The ❤️ tap is timed so the matching
// reaction floats up the big screen a beat later: this is where the emojis
// on the TV come from.
function HeroCheerPhone() {
  return (
    <div className={`${styles.heroPhone} ${styles.heroPhoneBack}`}>
      <div className={styles.heroPhoneBody}>
        <span className={styles.hpNotch} />
        <div className={styles.hpHeader}>
          <span className={styles.hpBrand}>KaraoQ</span>
          <span className={styles.hpRoom}>X7K2M</span>
        </div>
        <div className={styles.hpNow}>
          <span className={styles.hpNowDot} />
          <div className={styles.hpNowInfo}>
            <span className={styles.hpNowLabel}>Now Playing</span>
            <span className={styles.hpNowSong}>Mike &mdash; Don&apos;t Stop Believin&apos;</span>
          </div>
        </div>
        <div className={styles.hpCheer}>
          <div className={styles.hpCheerHead}>
            <span className={styles.hpCheerLabel}>Cheer them on!</span>
            <span className={styles.hpCheerSent}>{'\u{2764}\u{FE0F}'} Sent!</span>
          </div>
          <div className={styles.hpCheerGrid}>
            <span className={styles.hpCheerBtn}>{'\u{1F525}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{1F44F}'}</span>
            <span className={`${styles.hpCheerBtn} ${styles.hpCheerTap}`}>{'\u{2764}\u{FE0F}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{1F3A4}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{2B50}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{1F64C}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{1F929}'}</span>
            <span className={styles.hpCheerBtn}>{'\u{1F3B5}'}</span>
          </div>
        </div>
        {/* Same drawer as the search phone — the queue is shared, so its
            3 → 4 tick lands on both phones in the same beat. */}
        <div className={styles.hpDrawer}>
          <span className={styles.hpDrawerDot} />
          <span className={styles.hpDrawerNow}>Mike &middot; Don&apos;t Stop Believin&apos;</span>
          <span className={styles.hpDrawerBadge}>
            <span className={styles.hpBadgeA}>3 up next</span>
            <span className={styles.hpBadgeB}>4 up next</span>
          </span>
        </div>
        <span className={styles.hpHomeBar} />
      </div>
    </div>
  );
}

// ─── Hero scene: the real product in one frame ───
// The karaoke video (with highlighting lyrics) plays on any screen, while
// everyone adds songs — right from the screen or from their own phones after
// joining. Faithful to Display.tsx / SongSearch.tsx.
function HeroDemo() {
  // Shared room queue, played out on the screen. Sarah's pick lands as #4
  // mid-loop, synced to the add happening on the front phone below.
  const queue = [
    { num: 1, singer: 'Jordan', song: 'Mr. Brightside' },
    { num: 2, singer: 'Priya', song: 'Levitating' },
    { num: 3, singer: 'Diego', song: 'Sweet Caroline' },
  ];
  // Lyrics of the on-stage song, highlighted line-by-line like a karaoke video.
  const lyrics = [
    { text: 'Just a small town girl', sweep: styles.hdSweepA },
    { text: 'Livin’ in a lonely world', sweep: styles.hdSweepB },
    { text: 'She took the midnight train', sweep: styles.hdSweepC },
  ];

  return (
    <div className={styles.heroScene} aria-hidden="true">
      <span className={styles.heroTvTag}>Plays on any screen</span>

      {/* The screen — TV, laptop, or iPad. Faithful to the real Display view. */}
      <div className={styles.heroTv}>
        <div className={styles.heroTvScreen}>
          <div className={styles.hdHeader}>
            <span className={styles.hdBrand}>KaraoQ</span>
            {/* Add right from the screen (the host's add bar). */}
            <span className={styles.hdAddBar}>
              <span className={styles.hdAddIcon} />
              <span className={styles.hdAddText}>Search to add a song</span>
              <span className={styles.hdAddBtn}>+</span>
            </span>
          </div>
          <div className={styles.hdBody}>
            <div className={styles.hdMain}>
              {/* The currently-playing YouTube karaoke video. */}
              <div className={styles.hdVideo}>
                <span className={styles.hdYtBadge}>
                  <span className={styles.hdYtPlay} /> YouTube
                </span>
                {/* Lyrics light up as the song plays — this is karaoke. */}
                <div className={styles.hdLyrics}>
                  {lyrics.map((l, i) => (
                    <span key={i} className={`${styles.hdLyricLine} ${l.sweep}`}>
                      {l.text}
                    </span>
                  ))}
                </div>
                <div className={styles.hdReactions}>
                  <span className={`${styles.hdReaction} ${styles.hdR1}`}>{'\u{1F525}'}</span>
                  <span className={`${styles.hdReaction} ${styles.hdR2}`}>{'\u{1F44F}'}</span>
                  <span className={`${styles.hdReaction} ${styles.hdR3}`}>{'\u{2764}\u{FE0F}'}</span>
                  <span className={`${styles.hdReaction} ${styles.hdR4}`}>{'\u{1F929}'}</span>
                </div>
                <div className={styles.hdVideoBar}>
                  <span className={styles.hdVideoTime}>1:24</span>
                  <span className={styles.hdVideoProgress}>
                    <span className={styles.hdVideoProgressFill} />
                  </span>
                  <span className={styles.hdVideoTime}>3:48</span>
                </div>
              </div>
              {/* Now-playing bar — who's on stage right now. */}
              <div className={styles.hdNowBar}>
                <span className={styles.hdNowDot} />
                <span className={styles.hdNowLabel}>ON STAGE</span>
                <span className={styles.hdNowSinger}>Mike</span>
                <span className={styles.hdNowSong}>Don&apos;t Stop Believin&apos;</span>
              </div>
            </div>
            {/* Sidebar: scan-to-join QR + the live queue. */}
            <div className={styles.hdSidebar}>
              <div className={styles.hdQr}>
                <div className={styles.hdQrCode} />
                <span className={styles.hdQrLabel}>SCAN TO JOIN</span>
                <span className={styles.hdQrText}>X7K2M</span>
              </div>
              <div className={styles.hdQueue}>
                <div className={styles.hdQueueTitle}>
                  Up Next{' '}
                  <span className={styles.hdQueueCount}>
                    <span className={styles.hdCountA}>3</span>
                    <span className={styles.hdCountB}>4</span>
                  </span>
                </div>
                {queue.map((q) => (
                  <div key={q.num} className={styles.hdQueueItem}>
                    <span className={styles.hdQueueNum}>{q.num}</span>
                    <div className={styles.hdQueueInfo}>
                      <span className={styles.hdQueueSinger}>{q.singer}</span>
                      <span className={styles.hdQueueSong}>{q.song}</span>
                    </div>
                  </div>
                ))}
                {/* Sarah's song arriving live from her phone — the real-time
                    sync beat the whole hero builds to. */}
                <div className={`${styles.hdQueueItem} ${styles.hdQueueItemNew}`}>
                  <span className={styles.hdQueueNum}>4</span>
                  <div className={styles.hdQueueInfo}>
                    <span className={styles.hdQueueSinger}>Sarah</span>
                    <span className={styles.hdQueueSong}>Golden</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.heroTvStand} />
      </div>

      {/* Two guest phones in front of the TV stand — the whole loop from the
          crowd's side. The front phone plays the real add loop (tap + → toast
          → the song appears in the TV's Up Next); the back phone cheers, and
          its ❤️ tap is what sends the reaction floating up the big screen. */}
      <div className={styles.heroPhones}>
        <HeroPhoneCard
          className={styles.heroPhoneFront}
          search="golden"
          toast={'Added “Golden” to the queue!'}
          results={[
            { title: 'HUNTR/X – Golden (Karaoke)', tapped: true },
            { title: 'Golden – Instrumental + Lyrics' },
            { title: 'Golden – Higher Key Karaoke' },
          ]}
        />
        <HeroCheerPhone />
      </div>

      <span className={styles.heroPhonesTag}>Or add songs &amp; cheer from any phone</span>
    </div>
  );
}

// ─── Main Home / Landing Page ───
const CUSTOM_CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

const Home = (): React.ReactElement => {
  const router = useRouter();
  const [joinCode, setJoinCode] = React.useState('');
  const [showJoin, setShowJoin] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [customCode, setCustomCode] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [hostError, setHostError] = React.useState('');
  const [hostName, setHostName] = React.useState('');
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [resumeRoom, setResumeRoom] = React.useState<{
    code: string;
    songCount: number;
  } | null>(null);

  // Pre-fill the host's name from a previous session so returning hosts can
  // start a queue without retyping it.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('karaoq_host_name');
      if (saved) setHostName(saved);
    } catch {}
  }, []);

  // A host coming back to the landing page mid-night tends to create a second
  // room because they lost the first — offer their recent room back instead.
  // Verified against the API so a room deleted from admin is never offered.
  React.useEffect(() => {
    const last = getLastHostedRoom();
    if (!last) return;
    let cancelled = false;
    getRoom(last.code).then((room) => {
      if (cancelled) return;
      if (!room) {
        clearLastHostedRoom();
        return;
      }
      setResumeRoom({
        code: last.code,
        // Songs still ahead of the playhead — what "resuming" gets them.
        songCount: Math.max(0, room.queue.length - room.activeVideoIndex),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissResume() {
    clearLastHostedRoom();
    setResumeRoom(null);
  }

  async function handleHost(useCustom = false) {
    if (creating) return;
    const name = hostName.trim();
    if (!name) {
      setHostError('Enter your name to start');
      return;
    }
    const code = useCustom ? customCode.trim().toUpperCase() : generateCode();
    if (useCustom && !CUSTOM_CODE_PATTERN.test(code)) {
      setHostError('Code must be 3\u201312 letters or numbers');
      return;
    }
    setHostError('');
    // Carry the name into the host view so the queue starts already set up.
    try {
      localStorage.setItem('karaoq_host_name', name);
    } catch {}
    setCreating(true);
    try {
      const headers: Record<string, string> = {};
      if (useCustom) headers['x-custom-code'] = '1';
      const resp = await fetch(`/api/queue/${code}`, { method: 'POST', headers });
      if (resp.ok) {
        rememberLastHostedRoom(code);
        router.push(`/host/${code}`);
      } else if (resp.status === 409) {
        setHostError('That code is already in use');
        setCreating(false);
      } else {
        setHostError('Something went wrong. Try again.');
        setCreating(false);
      }
    } catch {
      setHostError('Something went wrong. Try again.');
      setCreating(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code) {
      router.push(`/sing/${code}`);
    }
  }

  function scrollToHero() {
    document
      .querySelector(`.${styles.hero}`)
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  // Nav / footer "Host" CTAs: returning hosts (name already saved) get
  // one-click hosting; first-timers are sent to the hero form with the name
  // field focused, instead of a silent error.
  function handleHostCta() {
    if (creating) return;
    if (!hostName.trim()) {
      scrollToHero();
      nameInputRef.current?.focus();
      return;
    }
    handleHost(false);
  }

  function handleJoinCta() {
    setShowJoin(true);
    scrollToHero();
  }

  return (
    <>
      {/* ─── Navigation ─── */}
      <nav className={styles.nav}>
        <span className={styles.navLogo}>KaraoQ</span>
        <div className={styles.navLinks}>
          <a href="#how-it-works" className={styles.navLink}>How It Works</a>
          <a href="#setup" className={styles.navLink}>Setup</a>
          <a href="#features" className={styles.navLink}>Features</a>
          <button className={styles.navCtaOutline} onClick={handleJoinCta}>
            Join a Session
          </button>
          <button className={styles.navCta} onClick={handleHostCta} disabled={creating}>
            {creating ? 'Creating…' : 'Host a Session'}
          </button>
        </div>
      </nav>

      <main>
        {/* ─── Hero ─── */}
        <section className={styles.hero}>
          {/* Three grid blocks — copy, demo scene, CTA card. Desktop places
              copy+CTA in the left column with the scene alongside; when the
              hero stacks, DOM order puts the scene between the pitch and the
              form, so newcomers see what KaraoQ is before it asks for a name. */}
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>YouTube Karaoke. Zero Setup.</h1>
              <p className={styles.heroSub}>
                Everyone adds songs from their own phone &mdash; the queue plays
                on any screen you&apos;ve got. Host a room for the party, or hop
                into one with a code. No app, no karaoke machine, no setup.
              </p>
              {/* A room from earlier tonight outranks starting a new one —
                  the duplicate-room path this banner exists to close. */}
              {resumeRoom && (
                <div className={styles.resumeCard}>
                  <span className={styles.resumeDot} aria-hidden="true" />
                  <span className={styles.resumeText}>
                    Your room <strong>{resumeRoom.code.toUpperCase()}</strong>{' '}
                    is still open
                    {resumeRoom.songCount > 0 &&
                      ` — ${resumeRoom.songCount} song${
                        resumeRoom.songCount !== 1 ? 's' : ''
                      } queued`}
                  </span>
                  <button
                    className={styles.resumeBtn}
                    onClick={() => router.push(`/host/${resumeRoom.code}`)}
                  >
                    Resume hosting
                  </button>
                  <button
                    className={styles.resumeDismiss}
                    onClick={dismissResume}
                    aria-label="Dismiss"
                    title="Dismiss"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>

            <HeroDemo />

            <div className={styles.heroCta}>
              {/* One glass card holds the whole way in: host a room (custom
                  codes tucked behind a small toggle), or join with a code. */}
              <div className={styles.hostCard}>
                <span className={styles.hostCardKicker}>
                  Host tonight&rsquo;s karaoke
                </span>
                <input
                    ref={nameInputRef}
                    className={styles.nameInput}
                    placeholder="Your name"
                    aria-label="Your name"
                    maxLength={30}
                    value={hostName}
                    onChange={(e) => {
                      setHostName(e.target.value);
                      setHostError('');
                    }}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && handleHost(showCustom)
                    }
                  />

                  {!showCustom ? (
                    <button
                      className={styles.btnPrimary}
                      onClick={() => handleHost(false)}
                      disabled={creating}
                    >
                      {creating ? 'Creating…' : 'Start a Room'}
                    </button>
                  ) : (
                    <div className={styles.joinRow}>
                      <input
                        className={styles.joinInput}
                        placeholder="CUSTOM CODE"
                        aria-label="Custom room code"
                        maxLength={12}
                        value={customCode}
                        onChange={(e) => {
                          setCustomCode(e.target.value.toUpperCase());
                          setHostError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleHost(true)}
                        autoFocus
                      />
                      <button
                        className={styles.btnPrimary}
                        onClick={() => handleHost(true)}
                        disabled={creating || !customCode.trim()}
                      >
                        {creating ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.textToggle}
                    onClick={() => {
                      setShowCustom((v) => !v);
                      setHostError('');
                    }}
                  >
                    {showCustom
                      ? 'Use a random code instead'
                      : 'Use a custom room code'}
                  </button>

                {hostError && <p className={styles.hostError}>{hostError}</p>}

                {/* Secondary path: joining with a code (most guests arrive by
                    scanning a QR, so this stays lightweight). */}
                <div className={styles.joinPrompt}>
                  {!showJoin ? (
                    <button
                      type="button"
                      className={styles.joinLink}
                      onClick={() => setShowJoin(true)}
                    >
                      Have a code? <span>Join a session →</span>
                    </button>
                  ) : (
                    <div className={styles.joinRow}>
                      <input
                        className={styles.joinInput}
                        placeholder="ROOM CODE"
                        aria-label="Room code"
                        maxLength={12}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                        autoFocus
                      />
                      <button
                        className={styles.btnOutline}
                        onClick={handleJoin}
                        disabled={!joinCode.trim()}
                      >
                        Join
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className={styles.heroNote}>No account needed. Ready in seconds.</p>
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className={styles.howSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <p className={styles.sectionSub}>
              Three steps, under a minute &mdash; whether it&apos;s two friends
              or a whole bar.
            </p>
          </Reveal>

          <div className={styles.steps}>
            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>You, the host</span>
                <div className={styles.laptopFrame}>
                  <div className={styles.laptopScreen}>
                    <span className={styles.laptopCamera} />
                    <StartResumeDemo />
                  </div>
                  <div className={styles.laptopBase} />
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>1</span>
                <h3 className={styles.stepTitle}>Start a Room</h3>
                <p className={styles.stepDesc}>
                  One tap gets you a room code and QR &mdash; no accounts, no
                  downloads, no sign-ups. Add the first song yourself or share
                  the code around. And if you step away mid-night, your room
                  and its queue are right where you left them.
                </p>
              </div>
            </Reveal>

            <Reveal className={`${styles.step} ${styles.stepReverse}`}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>Everyone&apos;s phones</span>
                <div className={styles.phoneFrameSm}>
                  <div className={styles.phoneNotch} />
                  <div className={styles.phoneScreen}>
                    <QueueBuildDemo />
                  </div>
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>2</span>
                <h3 className={styles.stepTitle}>Everyone Adds Songs</h3>
                <p className={styles.stepDesc}>
                  Anyone in the room scans the code and searches YouTube from their
                  own phone, dropping songs into the shared queue. Karaoke mode
                  finds the best versions automatically.
                </p>
              </div>
            </Reveal>

            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>The big screen</span>
                <div className={styles.tvFrame}>
                  <div className={styles.tvScreen}>
                    <BigScreenDemo />
                  </div>
                  <div className={styles.tvStand} />
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>3</span>
                <h3 className={styles.stepTitle}>Sing on Any Screen</h3>
                <p className={styles.stepDesc}>
                  Open the display on whatever everyone&apos;s facing &mdash; TV,
                  laptop, projector, tablet. Lyrics light up as you sing, the host
                  steers the queue, and a QR code lets latecomers jump in.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Setup Guide ─── */}
        {/* Answers the question How It Works leaves open: "OK, but what do I
            physically need?" Three honest recipes — every one is just a
            browser plus whatever plays the audio. */}
        <section id="setup" className={styles.setupSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>What You Need to Host</h2>
            <p className={styles.sectionSub}>
              Less than you think &mdash; a screen with a browser and something
              that makes sound. Three ways people run it:
            </p>
          </Reveal>

          <div className={styles.setupGrid}>
            <Reveal delay={0}>
              <div className={styles.setupCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <span className={styles.setupTag}>Zero setup</span>
                <h3 className={styles.setupTitle}>Just a Laptop or iPad</h3>
                <p className={styles.setupDesc}>
                  Open KaraoQ, turn up the volume, and you&apos;re hosting. The
                  video plays right on the device while everyone queues songs
                  from their phones. Plug in a Bluetooth speaker if the room
                  gets loud.
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>You need</span>
                  <ul className={styles.setupGear}>
                    <li>A laptop, iPad, or any device with a browser</li>
                  </ul>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.setupCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <span className={styles.setupTag}>Most popular</span>
                <h3 className={styles.setupTitle}>The Living Room TV</h3>
                <p className={styles.setupDesc}>
                  Put the song on the big screen &mdash; cast with AirPlay or
                  Google Cast, or plug your laptop into the TV with HDMI. The
                  TV&apos;s speakers carry the sound, and your device stays the
                  control booth.
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>You need</span>
                  <ul className={styles.setupGear}>
                    <li>A laptop or phone</li>
                    <li>A TV</li>
                    <li>HDMI or casting (AirPlay / Google Cast)</li>
                  </ul>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.setupCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <span className={styles.setupTag}>Bars &amp; big parties</span>
                <h3 className={styles.setupTitle}>Screen + Sound System</h3>
                <p className={styles.setupDesc}>
                  Run a laptop into the venue&apos;s display and sound system
                  &mdash; HDMI to the screen, aux to the speakers. Guests add
                  songs from their phones all night, and mics go through the PA
                  like any other karaoke night.
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>You need</span>
                  <ul className={styles.setupGear}>
                    <li>A laptop</li>
                    <li>A big screen or projector</li>
                    <li>Speakers or a PA system</li>
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <p className={styles.setupNote}>
              <strong>No karaoke machine, no microphones required.</strong>{' '}
              KaraoQ puts the song and lyrics on screen; sound comes from
              whatever&apos;s playing the video. Most living rooms just sing
              out loud &mdash; and if you have mics, run them through your
              speakers and you&apos;re a full venue.
            </p>
          </Reveal>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className={styles.featuresSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>Everything You Need</h2>
            <p className={styles.sectionSub}>
              No DJ equipment. No karaoke machine. Just phones and a screen.
            </p>
          </Reveal>

          <div className={styles.featuresGrid}>
            <Reveal delay={0}>
              <div className={styles.featureCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <polygon points="10,8 14,11 10,14" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>YouTube-Powered</h3>
                <p className={styles.featureDesc}>
                  Millions of karaoke tracks at your fingertips. Search, preview,
                  and queue songs instantly from YouTube.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.featureCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6" />
                    <path d="M2.5 22v-6h6" />
                    <path d="M2.5 11.5a10 10 0 0 1 18.8-4.3" />
                    <path d="M21.5 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Real-Time Sync</h3>
                <p className={styles.featureDesc}>
                  Everyone sees the queue update live across all devices. No
                  refreshing needed &mdash; it just works.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.featureCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Cast to Any Screen</h3>
                <p className={styles.featureDesc}>
                  Any screen with a browser becomes your karaoke display &mdash;
                  TV, laptop, projector, tablet. Just open the link.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0}>
              <div className={styles.featureCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="6" r="1.5" />
                    <circle cx="16" cy="6" r="1.5" />
                    <circle cx="8" cy="12" r="1.5" />
                    <circle cx="16" cy="12" r="1.5" />
                    <circle cx="8" cy="18" r="1.5" />
                    <circle cx="16" cy="18" r="1.5" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Drag &amp; Drop Queue</h3>
                <p className={styles.featureDesc}>
                  Hosts can reorder songs with a drag, move tracks to the top, or
                  remove them. Full control over the lineup.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.featureCard} style={{ '--accent': '#10b981' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
                    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Live Reactions</h3>
                <p className={styles.featureDesc}>
                  The audience cheers with emojis and messages that float across the
                  display in real time. Hype up the singer!
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.featureCard} style={{ '--accent': '#3b82f6' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="7" y="2" width="10" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Works on Any Device</h3>
                <p className={styles.featureDesc}>
                  Phones, tablets, laptops &mdash; any device with a browser becomes
                  a karaoke remote control.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Use Cases ─── */}
        <section className={styles.useCasesSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>Where Karaoke Happens</h2>
          </Reveal>

          <div className={styles.useCasesGrid}>
            <Reveal delay={0}>
              <div className={styles.useCaseCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <EqBars color="#ec4899" />
                <h3 className={styles.useCaseTitle}>House Parties</h3>
                <p className={styles.useCaseDesc}>
                  Turn your living room into a karaoke bar. Everyone picks songs
                  from their phone &mdash; no aux cord fights.
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className={styles.useCaseCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <EqBars color="#06b6d4" />
                <h3 className={styles.useCaseTitle}>Bars &amp; Venues</h3>
                <p className={styles.useCaseDesc}>
                  Run karaoke night with just a laptop and a screen. Guests queue
                  songs from their own phones.
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className={styles.useCaseCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
                <EqBars color="#f97316" />
                <h3 className={styles.useCaseTitle}>Team Events</h3>
                <p className={styles.useCaseDesc}>
                  Nothing breaks the ice like your manager singing Bohemian Rhapsody.
                  Perfect for offsites and holiday parties.
                </p>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className={styles.useCaseCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <EqBars color="#a855f7" />
                <h3 className={styles.useCaseTitle}>Celebrations</h3>
                <p className={styles.useCaseDesc}>
                  Birthdays, graduations, weddings &mdash; dedicate the first
                  song and let the party take over.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className={styles.faqSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
            <p className={styles.sectionSub}>
              Everything you need to know before your first song.
            </p>
          </Reveal>

          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item, i) => (
              <Reveal key={item.question} delay={i * 60}>
                <details className={styles.faqItem}>
                  <summary className={styles.faqQuestion}>{item.question}</summary>
                  <p className={styles.faqAnswer}>{item.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className={styles.ctaSection}>
          <Reveal>
            <h2 className={styles.ctaTitle}>Ready to Sing?</h2>
            <p className={styles.ctaSub}>
              Start a karaoke session in seconds. No sign-up required.
            </p>
            <div className={styles.ctaButtons}>
              <button
                className={styles.btnPrimary}
                onClick={handleHostCta}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Host a Session'}
              </button>
              <button className={styles.btnOutline} onClick={handleJoinCta}>
                Join a Session
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            made with <span className={styles.footerHeart}>&#9829;</span> by Variations on a String
          </a>
        </div>
      </footer>
    </>
  );
};

export default Home;
