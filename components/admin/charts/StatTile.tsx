import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import Sparkline from './Sparkline';
import { STATUS, type StatusTone } from './palette';

/**
 * `tone` only adds a dot: the label text carries the meaning, never the color.
 * The value stays in ink so it is never read as a data series.
 */
export default function StatTile({
  label,
  value,
  sub,
  spark,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  spark?: number[];
  tone?: StatusTone;
}): React.ReactElement {
  return (
    <div className={styles.tile}>
      <div className={styles.tileTop}>
        <span className={styles.tileLabel}>
          {tone && (
            <span
              className={styles.tileDot}
              style={{ background: STATUS[tone] }}
              aria-hidden="true"
            />
          )}
          {label}
        </span>
        {spark && spark.length > 1 && (
          <span className={styles.tileSpark}>
            <Sparkline data={spark} />
          </span>
        )}
      </div>
      <div className={styles.tileValue}>{value}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
    </div>
  );
}
