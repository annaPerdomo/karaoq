import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { fillDays } from '../chartData';
import { WINDOW } from '../format';
import ColumnChart from '../charts/ColumnChart';
import Heatmap from '../charts/Heatmap';
import { SERIES } from '../charts/palette';

export default function PulseRhythm({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { charts } = data;
  const timezone = data.meta?.timezone ?? 'UTC';
  const activityGrid = charts.activityGrid ?? [];

  return (
    <>
      <h2 className={styles.sectionHeading}>Rhythm · {WINDOW.last30}</h2>
      {activityGrid.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            When the party happens ({timezone})
          </h2>
          <Heatmap rows={activityGrid} />
        </section>
      )}
      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Rooms created</h2>
          <ColumnChart
            data={fillDays(charts.roomsByDay, 30)}
            ariaLabel="Rooms created per day"
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Songs added</h2>
          <ColumnChart
            data={fillDays(charts.songsByDay, 30)}
            color={SERIES[2]}
            ariaLabel="Songs added per day"
          />
        </section>
      </div>
    </>
  );
}
