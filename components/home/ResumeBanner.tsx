import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

export interface ResumeBannerProps {
  code: string;
  /** Songs still ahead of the playhead — what "resuming" actually gets them. */
  songCount: number;
  onResume: () => void;
  onDismiss: () => void;
}

export default function ResumeBanner({
  code,
  songCount,
  onResume,
  onDismiss,
}: ResumeBannerProps) {
  const { t, tn } = useT();

  return (
    <div className={styles.resumeCard}>
      <span className={styles.resumeDot} aria-hidden="true" />
      <span className={styles.resumeText}>
        {t('home.resume.open').split(/(\{code\})/).map((part, i) =>
          part === '{code}'
            ? <strong key={i}>{code.toUpperCase()}</strong>
            : <React.Fragment key={i}>{part}</React.Fragment>
        )}
        {songCount > 0 && tn('home.resume.queued', songCount)}
      </span>
      <button className={styles.resumeBtn} onClick={onResume}>
        {t('home.resume.button')}
      </button>
      <button
        className={styles.resumeDismiss}
        onClick={onDismiss}
        aria-label={t('home.resume.dismiss')}
        title={t('home.resume.dismiss')}
      >
        &times;
      </button>
    </div>
  );
}
