import Link from 'next/link';
import { useRouter } from 'next/router';
import * as React from 'react';
import { GUIDES } from '../lib/guides';
import getRoom from '../app/queue/getRoom';
import {
  clearLastHostedRoom,
  getLastHostedRoom,
  rememberLastHostedRoom,
} from '../lib/lastRoom';
import styles from '../styles/Home.module.css';
import { useT } from '../lib/i18n/I18nProvider';
import { renderWithHeart } from '../lib/i18n/renderWithHeart';
import LanguageSwitcher from './LanguageSwitcher';

// FAQ content, exported so the landing page can mirror it in FAQPage structured data.
// Google requires the JSON-LD text to match the visible answers, so keep both
// sourced from here. The English text here is what SSR + JSON-LD emit (kept
// consistent for SEO); `id` maps each item to its faq.* translation keys, which
// the client swaps in for the visitor's language.
export const FAQ_ITEMS: { id: string; question: string; answer: string }[] = [
  {
    id: 'free',
    question: 'Is KaraoQ free to use?',
    answer:
      'Yes. KaraoQ is free to host and free to join. Songs play from YouTube, so there is nothing to buy or rent.',
  },
  {
    id: 'app',
    question: 'Do I need to download an app?',
    answer:
      'No downloads and no installs. KaraoQ runs entirely in your web browser on phones, tablets, laptops, and smart TVs.',
  },
  {
    id: 'equipment',
    question: 'What equipment do I need to host karaoke night?',
    answer:
      'A device with a browser and something that makes sound — a laptop or iPad on its own is enough. For a bigger night, put the video on a TV by casting or plugging in with HDMI. No karaoke machine or microphones required.',
  },
  {
    id: 'tv',
    question: 'How do I get the karaoke video on my TV?',
    answer:
      'Cast your screen with AirPlay or Google Cast, or connect your laptop to the TV with an HDMI cable. KaraoQ can also pop the video out into its own window, so the TV shows the song and lyrics while the controls stay on your screen.',
  },
  {
    id: 'account',
    question: 'Do my guests need an account to sing?',
    answer:
      'No sign-up is required for anyone. Guests scan a QR code or enter the room code, then start adding songs from their own phones.',
  },
  {
    id: 'join',
    question: 'How do guests join the karaoke session?',
    answer:
      'Create a room to get a short join code and QR code. Share either one, and guests can search YouTube and queue songs from their phones in seconds.',
  },
  {
    id: 'songs',
    question: 'Where do the karaoke songs come from?',
    answer:
      'Every song streams from YouTube, so you have millions of karaoke tracks, lyric videos, and instrumentals to choose from — no separate karaoke library needed.',
  },
  {
    id: 'venue',
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

function EqBars({ color }: { color: string }) {
  return (
    <div className={styles.eqBars} aria-hidden="true">
      {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
        <span key={i} className={styles.eqBar} style={{ animationDelay: `${d}s`, background: color }} />
      ))}
    </div>
  );
}

// Animated demo: start a room now, come back to it later (the host).
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

// Animated demo: the queue-building loop on a guest's phone.
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

// Animated demo: the big-screen payoff (Display view).
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

// A single phone running the real search-and-add flow.
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

// The second phone: cheering the singer on.
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

// Hero scene: the real product in one frame.
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

const CUSTOM_CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

const Home = (): React.ReactElement => {
  const router = useRouter();
  const { t, tn } = useT();
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
      setHostError(t('home.err.enterName'));
      return;
    }
    const code = useCustom ? customCode.trim().toUpperCase() : generateCode();
    if (useCustom && !CUSTOM_CODE_PATTERN.test(code)) {
      setHostError(t('home.err.codeFormat'));
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
        setHostError(t('home.err.codeInUse'));
        setCreating(false);
      } else {
        setHostError(t('home.err.generic'));
        setCreating(false);
      }
    } catch {
      setHostError(t('home.err.generic'));
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
      <nav className={styles.nav}>
        <span className={styles.navLogo}>KaraoQ</span>
        <div className={styles.navLinks}>
          <a href="#how-it-works" className={styles.navLink}>{t('home.nav.how')}</a>
          <a href="#setup" className={styles.navLink}>{t('home.nav.setup')}</a>
          <a href="#features" className={styles.navLink}>{t('home.nav.features')}</a>
          <button className={styles.navCtaOutline} onClick={handleJoinCta}>
            {t('home.nav.join')}
          </button>
          <button className={styles.navCta} onClick={handleHostCta} disabled={creating}>
            {creating ? t('home.creating') : t('home.nav.host')}
          </button>
          <LanguageSwitcher />
        </div>
      </nav>

      <main>
        <section className={styles.hero}>
          {/* Three grid blocks — copy, demo scene, CTA card. Desktop places
              copy+CTA in the left column with the scene alongside; when the
              hero stacks, DOM order puts the scene between the pitch and the
              form, so newcomers see what KaraoQ is before it asks for a name. */}
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>{t('home.hero.title')}</h1>
              <p className={styles.heroSub}>
                {t('home.hero.sub')}
              </p>
              {/* A room from earlier tonight outranks starting a new one —
                  the duplicate-room path this banner exists to close. */}
              {resumeRoom && (
                <div className={styles.resumeCard}>
                  <span className={styles.resumeDot} aria-hidden="true" />
                  <span className={styles.resumeText}>
                    {t('home.resume.open').split(/(\{code\})/).map((part, i) =>
                      part === '{code}'
                        ? <strong key={i}>{resumeRoom.code.toUpperCase()}</strong>
                        : <React.Fragment key={i}>{part}</React.Fragment>
                    )}
                    {resumeRoom.songCount > 0 &&
                      tn('home.resume.queued', resumeRoom.songCount)}
                  </span>
                  <button
                    className={styles.resumeBtn}
                    onClick={() => router.push(`/host/${resumeRoom.code}`)}
                  >
                    {t('home.resume.button')}
                  </button>
                  <button
                    className={styles.resumeDismiss}
                    onClick={dismissResume}
                    aria-label={t('home.resume.dismiss')}
                    title={t('home.resume.dismiss')}
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
                  {t('home.host.kicker')}
                </span>
                <input
                    ref={nameInputRef}
                    className={styles.nameInput}
                    placeholder={t('common.yourName')}
                    aria-label={t('common.yourName')}
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
                      {creating ? t('home.creating') : t('home.host.start')}
                    </button>
                  ) : (
                    <div className={styles.joinRow}>
                      <input
                        className={styles.joinInput}
                        placeholder={t('home.host.customPlaceholder')}
                        aria-label={t('home.host.customAria')}
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
                        {creating ? t('home.creating') : t('home.host.create')}
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
                      ? t('home.host.useRandom')
                      : t('home.host.useCustom')}
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
                      {t('home.join.haveCode')} <span>{t('home.join.link')}</span>
                    </button>
                  ) : (
                    <div className={styles.joinRow}>
                      <input
                        className={styles.joinInput}
                        placeholder={t('home.join.roomPlaceholder')}
                        aria-label={t('home.join.roomAria')}
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
                        {t('home.join.button')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className={styles.heroNote}>{t('home.hero.note')}</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={styles.howSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>{t('home.how.title')}</h2>
            <p className={styles.sectionSub}>
              {t('home.how.sub')}
            </p>
          </Reveal>

          <div className={styles.steps}>
            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>{t('home.step1.tag')}</span>
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
                <h3 className={styles.stepTitle}>{t('home.step1.title')}</h3>
                <p className={styles.stepDesc}>
                  {t('home.step1.desc')}
                </p>
              </div>
            </Reveal>

            <Reveal className={`${styles.step} ${styles.stepReverse}`}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>{t('home.step2.tag')}</span>
                <div className={styles.phoneFrameSm}>
                  <div className={styles.phoneNotch} />
                  <div className={styles.phoneScreen}>
                    <QueueBuildDemo />
                  </div>
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>2</span>
                <h3 className={styles.stepTitle}>{t('home.step2.title')}</h3>
                <p className={styles.stepDesc}>
                  {t('home.step2.desc')}
                </p>
              </div>
            </Reveal>

            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <span className={styles.stepTag}>{t('home.step3.tag')}</span>
                <div className={styles.tvFrame}>
                  <div className={styles.tvScreen}>
                    <BigScreenDemo />
                  </div>
                  <div className={styles.tvStand} />
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>3</span>
                <h3 className={styles.stepTitle}>{t('home.step3.title')}</h3>
                <p className={styles.stepDesc}>
                  {t('home.step3.desc')}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Setup Guide — answers the question How It Works leaves open: "OK, but what do I
            physically need?" Three honest recipes — every one is just a
            browser plus whatever plays the audio. */}
        <section id="setup" className={styles.setupSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>{t('home.setup.title')}</h2>
            <p className={styles.sectionSub}>
              {t('home.setup.sub')}
            </p>
          </Reveal>

          <div className={styles.setupGrid}>
            <Reveal delay={0}>
              <div className={styles.setupCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <span className={styles.setupTag}>{t('home.setup.card1.tag')}</span>
                <h3 className={styles.setupTitle}>{t('home.setup.card1.title')}</h3>
                <p className={styles.setupDesc}>
                  {t('home.setup.card1.desc')}
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
                  <ul className={styles.setupGear}>
                    <li>{t('home.setup.card1.gear1')}</li>
                  </ul>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.setupCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <span className={styles.setupTag}>{t('home.setup.card2.tag')}</span>
                <h3 className={styles.setupTitle}>{t('home.setup.card2.title')}</h3>
                <p className={styles.setupDesc}>
                  {t('home.setup.card2.desc')}
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
                  <ul className={styles.setupGear}>
                    <li>{t('home.setup.card2.gear1')}</li>
                    <li>{t('home.setup.card2.gear2')}</li>
                    <li>{t('home.setup.card2.gear3')}</li>
                  </ul>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.setupCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <span className={styles.setupTag}>{t('home.setup.card3.tag')}</span>
                <h3 className={styles.setupTitle}>{t('home.setup.card3.title')}</h3>
                <p className={styles.setupDesc}>
                  {t('home.setup.card3.desc')}
                </p>
                <div className={styles.setupGearBox}>
                  <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
                  <ul className={styles.setupGear}>
                    <li>{t('home.setup.card3.gear1')}</li>
                    <li>{t('home.setup.card3.gear2')}</li>
                    <li>{t('home.setup.card3.gear3')}</li>
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <p className={styles.setupNote}>
              <strong>{t('home.setup.note.strong')}</strong>
              {t('home.setup.note.rest')}
            </p>
          </Reveal>
        </section>

        <section id="features" className={styles.featuresSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>{t('home.features.title')}</h2>
            <p className={styles.sectionSub}>
              {t('home.features.sub')}
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
                <h3 className={styles.featureTitle}>{t('home.feature1.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature1.desc')}
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
                <h3 className={styles.featureTitle}>{t('home.feature2.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature2.desc')}
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
                <h3 className={styles.featureTitle}>{t('home.feature3.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature3.desc')}
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
                <h3 className={styles.featureTitle}>{t('home.feature4.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature4.desc')}
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
                <h3 className={styles.featureTitle}>{t('home.feature5.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature5.desc')}
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
                <h3 className={styles.featureTitle}>{t('home.feature6.title')}</h3>
                <p className={styles.featureDesc}>
                  {t('home.feature6.desc')}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={styles.useCasesSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>{t('home.useCases.title')}</h2>
          </Reveal>

          <div className={styles.useCasesGrid}>
            <Reveal delay={0}>
              <div className={styles.useCaseCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <EqBars color="#ec4899" />
                <h3 className={styles.useCaseTitle}>{t('home.useCase1.title')}</h3>
                <p className={styles.useCaseDesc}>
                  {t('home.useCase1.desc')}
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className={styles.useCaseCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <EqBars color="#06b6d4" />
                <h3 className={styles.useCaseTitle}>{t('home.useCase2.title')}</h3>
                <p className={styles.useCaseDesc}>
                  {t('home.useCase2.desc')}
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className={styles.useCaseCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
                <EqBars color="#f97316" />
                <h3 className={styles.useCaseTitle}>{t('home.useCase3.title')}</h3>
                <p className={styles.useCaseDesc}>
                  {t('home.useCase3.desc')}
                </p>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className={styles.useCaseCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <EqBars color="#a855f7" />
                <h3 className={styles.useCaseTitle}>{t('home.useCase4.title')}</h3>
                <p className={styles.useCaseDesc}>
                  {t('home.useCase4.desc')}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={styles.faqSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>{t('home.faq.title')}</h2>
            <p className={styles.sectionSub}>
              {t('home.faq.sub')}
            </p>
          </Reveal>

          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item, i) => (
              <Reveal key={item.id} delay={i * 60}>
                <details className={styles.faqItem}>
                  <summary className={styles.faqQuestion}>{t(`faq.${item.id}.q`)}</summary>
                  <p className={styles.faqAnswer}>{t(`faq.${item.id}.a`)}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <Reveal>
            <h2 className={styles.ctaTitle}>{t('home.cta.title')}</h2>
            <p className={styles.ctaSub}>
              {t('home.cta.sub')}
            </p>
            <div className={styles.ctaButtons}>
              <button
                className={styles.btnPrimary}
                onClick={handleHostCta}
                disabled={creating}
              >
                {creating ? t('home.creating') : t('home.nav.host')}
              </button>
              <button className={styles.btnOutline} onClick={handleJoinCta}>
                {t('home.nav.join')}
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <nav className={styles.footerGuides} aria-label={t('home.guides.title')}>
          <span className={styles.footerGuidesTitle}>{t('home.guides.title')}</span>
          <ul className={styles.footerGuidesList}>
            {GUIDES.map((g) => (
              <li key={g.id}>
                <Link href={`/guide/${g.slug}`} className={styles.footerGuidesLink}>
                  {t(`guide.${g.id}.h1`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.footerInner}>
          <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            {renderWithHeart(t('footer.credit'), styles.footerHeart)}
          </a>
        </div>
      </footer>
    </>
  );
};

export default Home;
