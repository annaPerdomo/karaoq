import * as React from 'react';
import styles from '../../styles/Analytics.module.css';

export default function BarChart({ data, color = '#a78bfa' }: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) return <p className={styles.empty}>No data yet</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={styles.barChart}>
      {data.map((d, i) => (
        <div key={i} className={styles.barRow}>
          <span className={styles.barLabel}>{d.label}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className={styles.barValue}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}
