import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ResolveSource, ScreensStats } from './types';
import { pct } from '../format';
import StatTile from '../charts/StatTile';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import { RESOLVE_LABELS, dayLabel, errorRows } from './labels';

const RESOLVE_ORDER: ResolveSource[] = ['cache', 'live', 'quota', 'busy', 'none'];

export default function MusicVideoSection({
  stats,
  days,
}: {
  stats: ScreensStats['musicVideo'];
  days: number;
}): React.ReactElement {
  const songsTried = stats.songsShown + stats.songsUnavailable;

  return (
    <>
      <h2 className={styles.sectionHeading}>Music-video screen · Last {days} days</h2>
      <div className={styles.tileGrid}>
        <StatTile
          label="Rooms using it"
          value={stats.rooms}
          sub={`${stats.opens} opens`}
        />
        <StatTile
          label="Came back"
          value={stats.repeatRooms}
          sub={
            stats.rooms > 0
              ? `${pct(stats.repeatRooms, stats.rooms)}% of rooms, on 2+ days`
              : 'no rooms yet'
          }
        />
        <StatTile
          label="Videos found"
          value={songsTried > 0 ? `${pct(stats.songsShown, songsTried)}%` : '—'}
          sub={`${stats.songsShown} of ${songsTried} songs had a video`}
        />
        <StatTile
          label="Needed a nudge"
          value={stats.songsShown > 0 ? `${Math.min(100, pct(stats.songsNudged, stats.songsShown))}%` : '—'}
          sub={
            stats.medianAbsOffset !== null
              ? `${stats.songsNudged} songs · median ${stats.medianAbsOffset}s off`
              : `${stats.songsNudged} songs`
          }
        />
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Rooms with the screen open, per day</h2>
        <ColumnChart
          data={stats.daily.map((d) => ({ label: dayLabel(d.day), value: d.rooms }))}
          ariaLabel="Rooms that opened the music-video screen per day"
        />
        <p className={`${styles.cardNote} ${styles.cardNoteAfterTiles}`}>
          Median time open:{' '}
          {stats.medianMinutesOpen !== null ? `${stats.medianMinutesOpen} min` : '—'} ·
          Screen link opened {stats.links.open} · copied {stats.links.copy}
        </p>
      </section>

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Where the video came from</h2>
          <BarList
            data={RESOLVE_ORDER.map((s) => ({ label: RESOLVE_LABELS[s], value: stats.resolve[s] }))}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Player errors</h2>
          <BarList data={errorRows(stats.errors)} />
        </section>
      </div>
    </>
  );
}
