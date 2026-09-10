import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { YoutubeQuotaData } from '../types';
import StatTile from '../charts/StatTile';
import ColumnChart from '../charts/ColumnChart';
import { SERIES_1, type StatusTone } from '../charts/palette';

// 10,000 units / 100 per search. The real ceiling is softer (150+ searches
// have landed in a day), so this only colours the tile.
const NOMINAL_SEARCHES = 100;

function tone(searches: number): StatusTone {
  if (searches >= NOMINAL_SEARCHES) return 'critical';
  if (searches >= NOMINAL_SEARCHES * 0.8) return 'warning';
  return 'good';
}

function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function QuotaCard({
  quota,
}: {
  quota: YoutubeQuotaData;
}): React.ReactElement {
  const today = quota.days[quota.days.length - 1];
  const resets = new Date(quota.resetsAt);
  // The payload is fetched once and never polled, so a countdown would sit at
  // "0m" once the page outlives the reset; a fixed time stays true.
  const resetsLocal = resets.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const stale = Date.now() >= resets.getTime();

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>YouTube quota (today, Pacific)</h2>
      {today && (
        <div className={styles.tileGrid}>
          <StatTile
            label="Searches today"
            value={today.searches}
            sub={`${today.searches - today.cronSearches} from rooms · ${today.cronSearches} from the cron`}
            tone={tone(today.searches)}
          />
          <StatTile
            label="≈ Units today"
            value={today.units.toLocaleString('en-US')}
            sub={`of a nominal 10,000 · ${today.pages} channel pages · ${today.lookups} lookups`}
          />
          <StatTile
            label="Resets at"
            value={stale ? 'reset' : resetsLocal}
            sub={stale ? 'refresh for today\'s numbers' : 'midnight Pacific, in your time'}
            tone={stale ? 'warning' : undefined}
          />
        </div>
      )}
      <p className={`${styles.cardNote} ${styles.cardNoteAfterTiles}`}>
        Counted from our own ledger: every search YouTube answered, plus the
        cron&rsquo;s channel pages, and the pasted-link and report endpoints&rsquo;
        lookups. The corpus sweep&rsquo;s lookups aren&rsquo;t billed here, so
        Google&rsquo;s console will read a little higher.
      </p>
      <div className={styles.cardChart}>
        <ColumnChart
          data={quota.days.map((d) => ({ label: formatDay(d.day), value: d.searches }))}
          color={SERIES_1}
          height={110}
          ariaLabel="YouTube searches per day, last 7 days"
        />
      </div>
    </section>
  );
}
