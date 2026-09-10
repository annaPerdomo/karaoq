import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { fillDays } from '../chartData';
import { pct, pctChange, trendLabel, WINDOW } from '../format';
import StatTile from '../charts/StatTile';
import type { StatusTone } from '../charts/palette';

function trendTone(current: number, previous: number): StatusTone | undefined {
  const change = pctChange(current, previous);
  if (change === null || change === 0) return undefined;
  return change > 0 ? 'good' : 'warning';
}

export default function PulseHeadline({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { overview, charts, funnel, trend7d } = data;
  const tz = data.meta?.timezone ?? 'UTC';

  const roomsSpark = fillDays(charts.roomsByDay, 7).map((d) => d.value);
  const songsSpark = fillDays(charts.songsByDay, 7).map((d) => d.value);

  return (
    <>
      <h2 className={styles.sectionHeading}>Momentum · {WINDOW.last7}</h2>
      <div className={styles.tileGrid}>
        <StatTile
          label="Rooms"
          value={trend7d?.rooms.current ?? overview.roomsLast7d}
          sub={
            trend7d
              ? trendLabel(trend7d.rooms.current, trend7d.rooms.previous)
              : `${overview.roomsToday} · ${WINDOW.today(tz)}`
          }
          spark={roomsSpark}
          tone={trend7d ? trendTone(trend7d.rooms.current, trend7d.rooms.previous) : undefined}
        />
        <StatTile
          label={trend7d ? 'Songs queued' : `Songs queued · ${WINDOW.allTime}`}
          value={trend7d?.songs.current ?? overview.totalSongs}
          sub={
            trend7d
              ? trendLabel(trend7d.songs.current, trend7d.songs.previous)
              : undefined
          }
          spark={songsSpark}
          tone={trend7d ? trendTone(trend7d.songs.current, trend7d.songs.previous) : undefined}
        />
        {funnel && funnel.roomsCreated > 0 && (
          <StatTile
            label={`Song-add rate · Last ${funnel.windowDays} days`}
            value={`${pct(funnel.roomsWithSong, funnel.roomsCreated)}%`}
            sub={`${funnel.roomsWithSong} of ${funnel.roomsCreated} rooms queued a song`}
          />
        )}
        <StatTile
          label={`Median session · ${WINDOW.allTime}`}
          value={`${overview.medianSessionMinutes ?? overview.avgSessionMinutes} min`}
          sub={`avg ${overview.avgSessionMinutes} min`}
        />
      </div>
      <p className={styles.cardNote}>
        {WINDOW.allTime}: {overview.totalRooms} rooms · {overview.totalSongs}{' '}
        songs · {overview.uniqueUsers} singers · {overview.totalReactions} cheers
      </p>
    </>
  );
}
