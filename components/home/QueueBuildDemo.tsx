import * as React from 'react';
import styles from '../../styles/Home.module.css';

// Animated demo: the queue-building loop on a guest's phone.
// One persistent Sing-view screen (header, search, the shared Up Next queue —
// mirrors Sing.tsx/SongSearch.tsx). The motion is the state changing the way
// it really does: type → results → tap + → toast, and the song lands in the
// queue. A beat later someone ELSE's song lands too — no interaction on this
// phone, because the queue is shared and live.
export default function QueueBuildDemo() {
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
