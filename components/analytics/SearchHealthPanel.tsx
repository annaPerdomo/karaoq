import * as React from 'react';
import styles from '../../styles/Analytics.module.css';
import BarChart from './BarChart';
import DetailRows from './DetailRows';
import { fillDays, type DayCount } from './chartData';

export interface SearchHealthData {
  byDay: DayCount[];
  totals: {
    _id: { failReason?: string; searchOutcome?: string };
    count: number;
  }[];
  last24h: number;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  'quota/stale': 'Quota spent — saved by cache',
  'quota/error': 'Quota spent — user saw error',
  'upstream/stale': 'YouTube unreachable — saved by cache',
  'upstream/error': 'YouTube unreachable',
  'rate_limited/error': 'Rate limited',
};

function breakdownLabel(reason: string | undefined, outcome: string | undefined): string {
  return (
    BREAKDOWN_LABELS[`${reason}/${outcome}`] ??
    `${reason ?? 'unknown'} / ${outcome ?? 'unknown'}`
  );
}

export default function SearchHealthPanel({
  byDay,
  totals,
  last24h,
}: SearchHealthData): React.ReactElement {
  const total = totals.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Search Health</h2>

      {total === 0 ? (
        <p className={styles.empty}>No search failures in the last 30 days 🎉</p>
      ) : (
        <>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{last24h}</div>
              <div className={styles.statLabel}>Failures (Last 24h)</div>
              <div className={styles.statSub}>{total} in the last 30 days</div>
            </div>
          </div>

          <h3 className={styles.sectionTitle}>Search Failures (Last 30 Days)</h3>
          <BarChart data={fillDays(byDay, 30)} color="#f87171" />

          <h3 className={styles.sectionTitle}>What Went Wrong</h3>
          <DetailRows
            rows={totals.map((row) => ({
              title: breakdownLabel(row._id.failReason, row._id.searchOutcome),
              meta: [String(row.count)],
            }))}
            empty="No failures"
          />
        </>
      )}
    </section>
  );
}
