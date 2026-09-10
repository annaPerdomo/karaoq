import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import Funnel from '../charts/Funnel';

export default function PulseActivation({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement | null {
  const { funnel } = data;
  if (!funnel || funnel.roomsCreated === 0) return null;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        Activation · Last {funnel.windowDays} days
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
  );
}
