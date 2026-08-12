import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { SearchHealthData } from '../types';
import { searchFailLabel } from '../format';
import { fillDays } from '../chartData';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import { STATUS } from '../charts/palette';

/** YouTube search failures (quota, upstream, rate limiting) over 30 days. */
export default function SearchHealthCard({
  health,
}: {
  health: SearchHealthData;
}): React.ReactElement {
  const total = health.totals.reduce((sum, t) => sum + t.count, 0);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Search health (last 30 days)</h2>
      {total === 0 ? (
        <p className={styles.empty}>
          No failed searches — quota and YouTube both held up. 🎉
        </p>
      ) : (
        <>
          <p className={styles.cardNote}>
            {total} failed searches · {health.last24h} in the last 24 hours
          </p>
          <BarList
            color={STATUS.warning}
            data={health.totals.map((t) => ({
              label: searchFailLabel(t._id.failReason ?? null, t._id.searchOutcome ?? null),
              value: t.count,
            }))}
          />
          <div className={styles.cardChart}>
            <ColumnChart
              data={fillDays(health.byDay, 30)}
              color={STATUS.warning}
              height={110}
              ariaLabel="Failed searches per day, last 30 days"
            />
          </div>
        </>
      )}
    </section>
  );
}
