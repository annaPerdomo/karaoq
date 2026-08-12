import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { fillHours, fillWeekdays, hoursFromGrid, pct } from '../format';
import { fillDays } from '../chartData';
import StatTile from '../charts/StatTile';
import ColumnChart from '../charts/ColumnChart';
import Heatmap from '../charts/Heatmap';
import Funnel from '../charts/Funnel';
import BarList from '../charts/BarList';
import { SERIES } from '../charts/palette';
import PulseAudience from './PulseAudience';
import PulseFeatures from './PulseFeatures';

export default function PulseView({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { overview, charts, funnel, engagement, rankings } = data;
  const timezone = data.meta?.timezone ?? 'UTC';
  const activityGrid = charts.activityGrid ?? [];

  const songAddRate =
    funnel && funnel.roomsCreated > 0
      ? pct(funnel.roomsWithSong, funnel.roomsCreated)
      : null;

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Pulse</h1>
          <p className={styles.viewSub}>
            The whole product at a glance: activation, rhythms, and reach.
          </p>
        </div>
      </header>

      <div className={styles.tileGrid}>
        <StatTile
          label="Rooms"
          value={overview.totalRooms}
          sub={`${overview.roomsToday} today · ${overview.roomsThisWeek} this week`}
          spark={fillDays(charts.roomsByDay, 30).map((d) => d.value)}
        />
        <StatTile
          label="Songs queued"
          value={overview.totalSongs}
          sub={`avg ${overview.avgSongsPerRoom}/room · max ${overview.maxSongsPerRoom}`}
          spark={fillDays(charts.songsByDay, 30).map((d) => d.value)}
        />
        <StatTile label="Unique singers" value={overview.uniqueUsers} />
        <StatTile label="Cheers sent" value={overview.totalReactions} />
        <StatTile
          label="Median session"
          value={`${overview.medianSessionMinutes ?? overview.avgSessionMinutes} min`}
          sub={`avg ${overview.avgSessionMinutes} min · max ${overview.maxSessionMinutes} min`}
        />
        {songAddRate !== null && funnel && (
          <StatTile
            label="Song-add rate"
            value={`${songAddRate}%`}
            sub={`rooms with ≥1 song, last ${funnel.windowDays} days`}
            tone={songAddRate >= 50 ? 'good' : 'warning'}
          />
        )}
      </div>

      {funnel && funnel.roomsCreated > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Activation funnel (last {funnel.windowDays} days)
          </h2>
          <Funnel
            steps={[
              { label: 'Room created', value: funnel.roomsCreated },
              { label: 'Searched', value: funnel.roomsSearched },
              { label: 'Added a song', value: funnel.roomsWithSong },
              { label: '3+ songs', value: funnel.roomsEngaged },
            ]}
          />
          {funnel.medianMinutesToFirstSong !== null && (
            <p className={styles.cardNote}>
              Median time to first song: {funnel.medianMinutesToFirstSong}m
              {funnel.p90MinutesToFirstSong !== null &&
                ` · p90: ${funnel.p90MinutesToFirstSong}m`}
            </p>
          )}
        </section>
      )}

      {activityGrid.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            When the party happens ({timezone}, last 30 days)
          </h2>
          <Heatmap rows={activityGrid} />
        </section>
      )}

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Rooms created (last 30 days)</h2>
          <ColumnChart
            data={fillDays(charts.roomsByDay, 30)}
            ariaLabel="Rooms created per day"
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Songs added (last 30 days)</h2>
          <ColumnChart
            data={fillDays(charts.songsByDay, 30)}
            color={SERIES[2]}
            ariaLabel="Songs added per day"
          />
        </section>
      </div>

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Peak hours ({timezone})</h2>
          <ColumnChart
            data={fillHours(hoursFromGrid(activityGrid))}
            height={110}
            ariaLabel="Events by hour of day"
          />
        </section>
        {charts.dayOfWeekSongs && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Songs by weekday</h2>
            <ColumnChart
              data={fillWeekdays(charts.dayOfWeekSongs)}
              color={SERIES[2]}
              height={110}
              ariaLabel="Songs added by weekday"
            />
          </section>
        )}
      </div>

      {engagement && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Songs per room (all time)</h2>
          <ColumnChart
            data={engagement.songsPerRoomHistogram.map((b) => ({
              label: b.label,
              value: b.count,
            }))}
            height={110}
            ariaLabel="Distribution of songs per room"
          />
        </section>
      )}

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Most queued songs</h2>
          <p className={styles.cardNote}>
            From youtube_song_data, which expires at 30 days — this is a 30-day
            ranking by policy, not by choice.
          </p>
          <BarList
            data={rankings.topSongs.map((s) => ({
              label: s._id.title,
              value: s.count,
            }))}
            maxRows={12}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top singers</h2>
          <BarList
            color={SERIES[2]}
            data={rankings.topUsers.map((u) => ({
              label: u._id,
              value: u.count,
            }))}
            maxRows={12}
          />
        </section>
      </div>

      <PulseAudience data={data} />
      <PulseFeatures data={data} />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sessions</h2>
        <p className={styles.cardNote}>
          {overview.totalSessions} total · {overview.hostSessions} hosts ·{' '}
          {overview.singerSessions} singers
          {engagement && engagement.hosts > 0 &&
            ` · ${engagement.repeatHosts} of ${engagement.hosts} hosts returned`}
          {` · ${overview.totalQrPrints} QR prints`}
        </p>
      </section>
    </div>
  );
}
