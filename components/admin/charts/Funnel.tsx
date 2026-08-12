import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import { SERIES_1 } from './palette';

/** One hue on purpose: the steps are one journey, not distinct series. */
export default function Funnel({
  steps,
}: {
  steps: { label: string; value: number }[];
}): React.ReactElement {
  const max = Math.max(steps[0]?.value ?? 0, 1);

  return (
    <div className={styles.funnel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : 0;
        const conversion = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{s.label}</span>
            <span className={styles.funnelTrack}>
              <span
                className={styles.funnelFill}
                style={{ width: `${(s.value / max) * 100}%`, background: SERIES_1 }}
              />
            </span>
            <span className={styles.funnelValue}>
              {s.value.toLocaleString('en-US')}
              <span className={styles.funnelPct}>
                {conversion !== null ? `${conversion}%` : ''}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
