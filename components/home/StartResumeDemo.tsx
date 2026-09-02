import * as React from 'react';
import styles from '../../styles/Home.module.css';

// Animated demo: start a room now, come back to it later (the host).
// Runs on a laptop frame — the recommended host setup (see the Setup guide),
// and it keeps the step devices honest: laptop (host) → phones (guests) →
// big screen. Beat 1 mirrors the landing host panel (a name and one button);
// beat 2 the host's empty stage — its copy is a hardcoded echo of host.empty.*
// and nothing fails when they drift apart;
// beat 3 the resume banner a returning host sees — the room isn't lost.
export default function StartResumeDemo() {
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
              <div className={styles.srStageTitle}>Your stage awaits</div>
              <div className={styles.srStageLede}>
                Add a song, grab the mic, and start the night &mdash; anyone
                who joins can add to the queue too.
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
