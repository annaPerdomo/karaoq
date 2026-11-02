import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { KaraokeSwapSource, ScreensStats } from './types';
import { pct } from '../format';
import StatTile from '../charts/StatTile';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import { dayLabel } from './labels';
import formatSongTitle from '../../../lib/songTitle';

const SOURCE_ORDER: KaraokeSwapSource[] = ['candidate', 'search', 'link'];
const SOURCE_LABELS: Record<KaraokeSwapSource, string> = {
  candidate: 'Suggested version',
  search: 'Searched',
  link: 'Pasted link',
};

function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function KaraokeSwapSection({
  stats,
  days,
}: {
  stats: ScreensStats['karaokeSwap'];
  days: number;
}): React.ReactElement {
  return (
    <>
      <h2 className={styles.sectionHeading}>Karaoke video swaps · Last {days} days</h2>
      <div className={styles.tileGrid}>
        <StatTile label="Swaps" value={stats.swaps} sub={`in ${stats.rooms} rooms`} />
        <StatTile
          label="Opened, then swapped"
          value={stats.opens > 0 ? `${Math.min(100, pct(stats.swaps, stats.opens))}%` : '—'}
          sub={`${stats.opens} opens`}
        />
        <StatTile
          label="Mid-song rescues"
          value={stats.swaps > 0 ? `${pct(stats.live, stats.swaps)}%` : '—'}
          sub={
            stats.medianSwapAtSeconds !== null
              ? `${stats.live} swaps · median ${clock(stats.medianSwapAtSeconds)} in`
              : `${stats.live} swaps while the song played`
          }
        />
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Swaps per day</h2>
        <ColumnChart
          data={stats.daily.map((d) => ({ label: dayLabel(d.day), value: d.swaps }))}
          ariaLabel="Karaoke video swaps per day"
        />
      </section>

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Where the new version came from</h2>
          <BarList
            data={SOURCE_ORDER.map((s) => ({ label: SOURCE_LABELS[s], value: stats.sources[s] }))}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Most swapped-away versions</h2>
          {stats.swappedAway.length > 0 ? (
            <BarList
              data={stats.swappedAway.map((s) => ({
                label: formatSongTitle(s.title),
                value: s.swaps,
                title: `${s.title} — ${s.swaps}`,
              }))}
            />
          ) : (
            <p className={styles.cardNote}>None in the last 30 days.</p>
          )}
          <p className={styles.cardNote}>YouTube titles are kept for 30 days.</p>
        </section>
      </div>
    </>
  );
}
