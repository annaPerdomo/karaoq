import * as React from 'react';
import styles from '../../styles/Home.module.css';

// Animated demo: the big-screen payoff (Display view).
// The two states the room actually sees, in sequence: "UP NEXT" calling the
// singer to the stage, then the song starting — lyrics light up, the crowd's
// reactions float by, and the sidebar queue advances (Mike's row leaves, the
// count ticks down). Mirrors Display.tsx.
export default function BigScreenDemo() {
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
