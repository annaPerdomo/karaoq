import * as React from 'react';
import styles from '../../../styles/AdminViz.module.css';
import type { StackedDatum } from '../chartData';

export interface StackedSeries {
  name: string;
  color: string;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rounded = Math.ceil(max);
  const half = Math.round(rounded / 2);
  return half > 0 && half < rounded ? [rounded, half] : [rounded];
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default function StackedColumnChart({
  data,
  series,
  height = 180,
  ariaLabel,
}: {
  data: StackedDatum[];
  series: StackedSeries[];
  height?: number;
  ariaLabel?: string;
}): React.ReactElement {
  const [active, setActive] = React.useState<number | null>(null);

  if (data.length === 0) {
    return <p className={styles.chartEmpty}>No data yet</p>;
  }

  const totals = data.map((d) => d.segments.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals, 1);
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
            <span className={styles.colTick}>{fmt(t)}</span>
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
                className={styles.colStack}
                style={{ height: `${(totals[i] / scaleMax) * 100}%` }}
              >
                {d.segments.map((v, s) =>
                  v > 0 ? (
                    <div
                      key={s}
                      className={styles.colSegment}
                      style={{
                        flexGrow: v,
                        background: series[s]?.color,
                      }}
                    />
                  ) : null
                )}
              </div>
              {active === i && (
                <div className={styles.chartTip} role="status">
                  <span className={styles.chartTipValue}>{fmt(totals[i])}</span>
                  <span className={styles.chartTipLabel}>{d.title ?? d.label}</span>
                  {series.map((sr, s) => (
                    <span key={sr.name} className={styles.chartTipRow}>
                      <span
                        className={styles.legendSwatch}
                        style={{ background: sr.color }}
                        aria-hidden="true"
                      />
                      {sr.name}: {fmt(d.segments[s] ?? 0)}
                    </span>
                  ))}
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
      <ul className={styles.legend}>
        {series.map((sr) => (
          <li key={sr.name} className={styles.legendItem}>
            <span
              className={styles.legendSwatch}
              style={{ background: sr.color }}
              aria-hidden="true"
            />
            {sr.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
