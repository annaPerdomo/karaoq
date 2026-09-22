import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DaySourcesWire } from '../types';
import StatTile from '../charts/StatTile';
import StackedColumnChart from '../charts/StackedColumnChart';
import { SERIES } from '../charts/palette';
import { formatDay } from './day';

/** Coalesced searches rode an identical one in flight, so they count as cache hits. */
const BUCKETS = [
  { name: 'YouTube (costs a search)', color: SERIES[0], pick: (d: DaySourcesWire) => d.sources.miss },
  {
    name: 'Our cache (free)',
    color: SERIES[1],
    pick: (d: DaySourcesWire) => d.sources.fresh + d.sources.coalesced,
  },
  { name: 'Song catalog (free)', color: SERIES[2], pick: (d: DaySourcesWire) => d.sources.corpus },
  {
    name: 'Old copy, quota was out',
    color: SERIES[3],
    pick: (d: DaySourcesWire) => d.sources.stale,
  },
];

export default function QuotaCache({
  sourcesByDay,
}: {
  sourcesByDay: DaySourcesWire[];
}): React.ReactElement {
  const totals = BUCKETS.map((b) => sourcesByDay.reduce((sum, d) => sum + b.pick(d), 0));
  const all = totals.reduce((a, b) => a + b, 0);
  const billed = totals[0];
  const free = totals[1] + totals[2];
  const freeShare = all > 0 ? Math.round((free / all) * 100) : 0;
  const freeByDay = sourcesByDay.map((d) => {
    const dayAll = BUCKETS.reduce((sum, b) => sum + b.pick(d), 0);
    return dayAll > 0 ? Math.round(((BUCKETS[1].pick(d) + BUCKETS[2].pick(d)) / dayAll) * 100) : 0;
  });

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Where searches were answered, last 30 days</h2>
      <p className={styles.cardNote}>
        Every search a singer ran. Only the ones YouTube answered live cost
        quota. The rest came from our cache of recent searches or the song
        catalog we built ahead of time.
      </p>
      <div className={styles.tileGrid}>
        <StatTile
          label="Answered for free"
          value={`${freeShare}%`}
          sub={`${totals[1].toLocaleString('en-US')} from cache · ${totals[2].toLocaleString('en-US')} from the catalog`}
          spark={freeByDay.slice(-14)}
          tone={freeShare >= 50 ? 'good' : freeShare >= 25 ? 'warning' : 'critical'}
        />
        <StatTile
          label="Cost a YouTube search"
          value={billed.toLocaleString('en-US')}
          sub={`of ${all.toLocaleString('en-US')} searches singers ran`}
        />
      </div>
      <div className={styles.cardChart}>
        <StackedColumnChart
          data={sourcesByDay.map((d) => ({
            label: formatDay(d.day),
            segments: BUCKETS.map((b) => b.pick(d)),
          }))}
          series={BUCKETS.map(({ name, color }) => ({ name, color }))}
          height={160}
          ariaLabel="Searches per day by where they were answered, last 30 days"
        />
      </div>
    </section>
  );
}
