import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import { SERIES_1 } from './palette';

export interface ColumnDatum {
  label: string;
  value: number;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rounded = Math.ceil(max);
  const half = Math.round(rounded / 2);
  return half > 0 && half < rounded ? [rounded, half] : [rounded];
}

/** The whole band is the tooltip's hit target, not the painted bar. */
export default function ColumnChart({
  data,
  color = SERIES_1,
  height = 150,
  ariaLabel,
}: {
  data: ColumnDatum[];
  color?: string;
  height?: number;
  ariaLabel?: string;
}): React.ReactElement {
  const [active, setActive] = React.useState<number | null>(null);

  if (data.length === 0) {
    return <p className={styles.chartEmpty}>No data yet</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = niceTicks(max);
  const scaleMax = ticks[0] || 1;
  const xLabels =
    data.length > 8
      ? [0, Math.floor(data.length / 2), data.length - 1]
      : data.map((_, i) => i);

  return (
    <div className={styles.colChart} role="img" aria-label={ariaLabel}>
      <div className={styles.colPlot} style={{ height }}>
        {ticks.map((t) => (
          <div
            key={t}
            className={styles.colGridline}
            style={{ bottom: `${(t / scaleMax) * 100}%` }}
          >
            <span className={styles.colTick}>{t.toLocaleString('en-US')}</span>
          </div>
        ))}
        <div className={styles.colBaseline} />
        <div className={styles.colCells}>
          {data.map((d, i) => (
            <div
              key={`${d.label}-${i}`}
              className={styles.colCell}
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
            >
              <div
                className={styles.colFill}
                style={{
                  height: `${(d.value / scaleMax) * 100}%`,
                  background: color,
                }}
              />
              {active === i && (
                <div className={styles.chartTip} role="status">
                  <span className={styles.chartTipValue}>
                    {d.value.toLocaleString('en-US')}
                  </span>
                  <span className={styles.chartTipLabel}>{d.label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.colXLabels}>
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className={styles.colXLabel}>
            {xLabels.includes(i) ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
