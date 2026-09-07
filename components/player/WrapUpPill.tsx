import * as React from 'react';
import styles from '../../styles/Countdown.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

/** The last seconds before the song limit cuts the song. Under player/ rather
 * than display/: both playback surfaces cut songs, so both must warn. */
export default function WrapUpPill({ secondsLeft }: { secondsLeft: number }): React.ReactElement {
  const { t } = useT();
  const m = Math.floor(secondsLeft / 60);
  const s = String(secondsLeft % 60).padStart(2, '0');
  return (
    <div className={styles.wrapUpPill} role="status">
      <span className={styles.wrapUpDot} />
      {t('display.wrapUp', { time: `${m}:${s}` })}
    </div>
  );
}
