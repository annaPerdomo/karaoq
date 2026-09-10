import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { fillHours, fillWeekdays, hoursFromGrid, WINDOW } from '../format';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import Disclosure from './Disclosure';
import { SERIES } from '../charts/palette';

export default function PulseMore({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { charts, engagement, rankings, overview } = data;
  const timezone = data.meta?.timezone ?? 'UTC';
  const activityGrid = charts.activityGrid ?? [];

  return (
    <Disclosure summary="More charts">
      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Peak hours ({timezone}) · {WINDOW.last30}
          </h2>
          <ColumnChart
            data={fillHours(hoursFromGrid(activityGrid))}
            height={110}
            ariaLabel="Events by hour of day"
          />
        </section>
        {charts.dayOfWeekSongs && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Songs by weekday · {WINDOW.allTime}</h2>
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
          <h2 className={styles.cardTitle}>Songs per room · {WINDOW.allTime}</h2>
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
          <h2 className={styles.cardTitle}>Most queued songs · {WINDOW.last30}</h2>
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
          <h2 className={styles.cardTitle}>Top singers · {WINDOW.allTime}</h2>
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

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sessions · {WINDOW.allTime}</h2>
        <p className={styles.cardNote}>
          {overview.totalSessions} total · {overview.hostSessions} hosts ·{' '}
          {overview.singerSessions} singers
          {engagement && engagement.hosts > 0 &&
            ` · ${engagement.repeatHosts} of ${engagement.hosts} hosts returned`}
          {` · ${overview.totalQrPrints} QR prints`}
        </p>
      </section>
    </Disclosure>
  );
}
