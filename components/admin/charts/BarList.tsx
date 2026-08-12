import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import { SERIES_1 } from './palette';

export interface BarListRow {
  label: string;
  value: number;
  /** Optional emoji/flag rendered before the label, outside the truncation. */
  prefix?: string;
  /** Optional full-detail tooltip; defaults to "label — value". */
  title?: string;
}

/**
 * One hue for every bar: they are one series, and length carries the value.
 * Values stay visible, so the sub-3:1 track never gates reading.
 */
export default function BarList({
  data,
  color = SERIES_1,
  maxRows,
}: {
  data: BarListRow[];
  color?: string;
  maxRows?: number;
}): React.ReactElement {
  const rows = maxRows ? data.slice(0, maxRows) : data;
  const max = Math.max(...rows.map((r) => r.value), 1);

  if (rows.length === 0) {
    return <p className={styles.chartEmpty}>No data yet</p>;
  }

  return (
    <div className={styles.barList}>
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className={styles.barRow}
          title={r.title ?? `${r.label} — ${r.value.toLocaleString('en-US')}`}
        >
          <span className={styles.barLabel}>
            {r.prefix && <span className={styles.barPrefix}>{r.prefix}</span>}
            <span className={styles.barLabelText}>{r.label}</span>
          </span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${(r.value / max) * 100}%`, background: color }}
            />
          </span>
          <span className={styles.barValue}>{r.value.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}
