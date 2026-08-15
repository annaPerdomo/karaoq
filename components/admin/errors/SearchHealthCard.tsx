import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { LinkLookupData, SearchHealthData } from '../types';
import { lookupOutcomeParts, searchFailLabel } from '../format';
import { fillDays } from '../chartData';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import { STATUS } from '../charts/palette';

/** YouTube search failures (quota, upstream, rate limiting) over 30 days, plus
 * how much of the quota the 1-unit paste-a-link path is carrying. */
export default function SearchHealthCard({
  health,
  links,
}: {
  health: SearchHealthData;
  links?: LinkLookupData;
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
      {links && (
        // Rendered at zero too: "nobody pasted a link in 30 days" is the answer
        // this row exists to give.
        <p className={styles.cardNote}>
          {[
            `Link lookups (30d): ${links.total}`,
            ...lookupOutcomeParts(links.byOutcome),
            ...links.bySrc.map((s) => `${s.count} from ${s._id}`),
          ].join(' · ')}
        </p>
      )}
    </section>
  );
}
