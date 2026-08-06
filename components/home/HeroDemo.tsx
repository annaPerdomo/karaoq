import * as React from 'react';
import styles from '../../styles/Home.module.css';

// A single phone running the real search-and-add flow.
// Mirrors SongSearch.tsx (room badge → search → results with a + to queue).
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
export default function HeroDemo() {
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
