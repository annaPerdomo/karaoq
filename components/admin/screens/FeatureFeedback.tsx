import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ScreensFeedbackEntry } from './types';
import { formatTimestamp } from '../format';
import Disclosure from '../pulse/Disclosure';

const PREVIEW_CHARS = 200;

// The Feedback view has no deep links, so rows are plain text.
export default function FeatureFeedback({
  entries,
}: {
  entries: ScreensFeedbackEntry[];
}): React.ReactElement {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Feedback about these features</h2>
      {entries.length === 0 ? (
        <p className={styles.cardNote}>
          Nothing from the music-video page or from rooms that used either feature.
        </p>
      ) : (
        <Disclosure summary={`${entries.length} recent entries`} defaultOpen>
          <div className={styles.rankList}>
            {entries.map((e, i) => (
              <div key={e.id} className={styles.rankRow}>
                <span className={styles.rankNum}>#{i + 1}</span>
                <div className={styles.rankMain}>
                  <span className={styles.rankTitle}>
                    <span className={styles.rankTitleText}>
                      {e.message.length > PREVIEW_CHARS
                        ? `${e.message.slice(0, PREVIEW_CHARS)}…`
                        : e.message}
                    </span>
                  </span>
                  <span className={styles.rankSub}>
                    {formatTimestamp(e.createdAt)} · {e.kind}
                    {e.page ? ` · ${e.page}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </section>
  );
}
