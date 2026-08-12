import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import { WEEKDAY_LABELS, formatHour } from '../format';
import { sequentialColor, SEQUENTIAL } from './palette';

/**
 * Sequential ramp, so hue carries magnitude and nothing else. The legend names
 * the extremes: an unanchored ramp is unreadable.
 */
export default function Heatmap({
  rows,
}: {
  /** Mongo $dayOfWeek: 1 = Sunday … 7 = Saturday. */
  rows: { _id: { dow: number; hour: number }; count: number }[];
}): React.ReactElement {
  const [active, setActive] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return <p className={styles.chartEmpty}>No activity yet</p>;
  }

  const byCell = new Map(rows.map((r) => [`${r._id.dow}:${r._id.hour}`, r.count]));
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className={styles.heatmap}>
      <div className={styles.hmGrid}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={styles.hmColLabel}>
            {h % 6 === 0 ? formatHour(h) : ''}
          </span>
        ))}
        {WEEKDAY_LABELS.map((day, d) => (
          <React.Fragment key={day}>
            <span className={styles.hmRowLabel}>{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const key = `${d + 1}:${h}`;
              const count = byCell.get(key) ?? 0;
              const fill = sequentialColor(count, max);
              return (
                <span
                  key={key}
                  className={styles.hmCell}
                  tabIndex={0}
                  style={fill ? { background: fill } : undefined}
                  onPointerEnter={() => setActive(key)}
                  onPointerLeave={() => setActive((a) => (a === key ? null : a))}
                  onFocus={() => setActive(key)}
                  onBlur={() => setActive((a) => (a === key ? null : a))}
                >
                  {active === key && (
                    <span className={styles.chartTip} role="status">
                      <span className={styles.chartTipValue}>{count}</span>
                      <span className={styles.chartTipLabel}>
                        {day} {formatHour(h)}
                      </span>
                    </span>
                  )}
                </span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className={styles.hmLegend}>
        <span>0</span>
        {SEQUENTIAL.map((c) => (
          <span key={c} className={styles.hmLegendStep} style={{ background: c }} />
        ))}
        <span>{max.toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}
