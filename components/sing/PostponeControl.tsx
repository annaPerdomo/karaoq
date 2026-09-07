import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import {
  QueueEstimate,
  formatApproxDuration,
  postponedStartSeconds,
} from '../../lib/queueTime';

/** Where the stepper starts: two songs is a bathroom break. */
const DEFAULT_AFTER = 2;

export default function PostponeControl({
  entryId,
  behind,
  estimate,
  onPostpone,
}: {
  entryId: string;
  /** Songs queued behind theirs — the most they can let past. */
  behind: number;
  estimate: QueueEstimate;
  onPostpone: (entryId: string, after: number | 'end') => Promise<boolean>;
}): React.ReactElement {
  const { t, tn } = useT();
  const [open, setOpen] = React.useState(false);
  const [after, setAfter] = React.useState(Math.min(DEFAULT_AFTER, behind));
  const [busy, setBusy] = React.useState(false);

  // The queue can shrink under the picker: never offer more than exists.
  const count = Math.min(after, behind);
  const toEnd = count >= behind;
  const startsIn = postponedStartSeconds(estimate, entryId, count);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onPostpone(entryId, toEnd ? 'end' : count);
      if (ok) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className={styles.postponeRow}>
        <span className={styles.postponeLead}>{t('sing.postpone.lead')}</span>
        <button className={styles.postponeBtn} onClick={() => setOpen(true)}>
          {t('sing.postpone.open')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.postponePicker}>
      <div className={styles.postponeStepper}>
        <button
          className={styles.postponeStep}
          onClick={() => setAfter((n) => Math.max(1, Math.min(n, behind) - 1))}
          disabled={count <= 1}
          aria-label={t('sing.postpone.fewer')}
        >
          −
        </button>
        <span className={styles.postponeCount} aria-live="polite">
          {tn('sing.postpone.count', count)}
        </span>
        <button
          className={styles.postponeStep}
          onClick={() => setAfter((n) => Math.min(behind, Math.min(n, behind) + 1))}
          disabled={count >= behind}
          aria-label={t('sing.postpone.more')}
        >
          +
        </button>
        {behind > 1 && (
          <button
            className={`${styles.postponeEnd} ${toEnd ? styles.postponeEndOn : ''}`}
            onClick={() => setAfter(behind)}
            aria-pressed={toEnd}
          >
            {t('sing.postpone.end')}
          </button>
        )}
      </div>
      <span className={styles.postponeEta}>
        {startsIn === null
          ? ''
          : toEnd
            ? t('sing.postpone.etaLast', { time: formatApproxDuration(startsIn, t) })
            : t('sing.postpone.eta', { time: formatApproxDuration(startsIn, t) })}
      </span>
      <div className={styles.postponeActions}>
        <button className={styles.postponeConfirm} onClick={confirm} disabled={busy}>
          {t('sing.postpone.confirm')}
        </button>
        <button className={styles.postponeCancel} onClick={() => setOpen(false)} disabled={busy}>
          {t('sing.postpone.cancel')}
        </button>
      </div>
    </div>
  );
}
