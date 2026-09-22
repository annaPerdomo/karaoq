import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DayRoomsWire } from '../types';
import ColumnChart from '../charts/ColumnChart';
import StatTile from '../charts/StatTile';
import { SERIES_1 } from '../charts/palette';
import { formatDay } from './day';

function sum(days: DayRoomsWire[]): number {
  return days.reduce((total, d) => total + d.searches, 0);
}

export default function QuotaHistory({
  roomsByDay,
  selectedDay,
  onSelectDay,
}: {
  roomsByDay: DayRoomsWire[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
}): React.ReactElement {
  const thisWeek = roomsByDay.slice(-7);
  const lastWeek = roomsByDay.slice(-14, -7);
  const busiest = roomsByDay.reduce(
    (best, d) => (d.searches > best.searches ? d : best),
    roomsByDay[0]
  );
  const activeDays = roomsByDay.filter((d) => d.searches > 0).length;
  const selectedIndex = roomsByDay.findIndex((d) => d.day === selectedDay);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Room searches, last 30 days</h2>
      <p className={styles.cardNote}>
        Searches singers ran from rooms, per day. Tap a day to see which rooms
        ran them.
      </p>
      <div className={styles.cardChart}>
        <ColumnChart
          data={roomsByDay.map((d) => ({ label: formatDay(d.day), value: d.searches }))}
          color={SERIES_1}
          height={140}
          ariaLabel="Room searches per day, last 30 days"
          selected={selectedIndex >= 0 ? selectedIndex : undefined}
          onSelect={(i) => onSelectDay(roomsByDay[i].day)}
        />
      </div>
      <div className={styles.tileGrid}>
        <StatTile
          label="This week"
          value={sum(thisWeek)}
          sub={`${sum(lastWeek)} the week before`}
          spark={thisWeek.map((d) => d.searches)}
        />
        <StatTile
          label="Busiest day"
          value={busiest ? busiest.searches : 0}
          sub={busiest ? formatDay(busiest.day, true) : '—'}
        />
        <StatTile
          label="Days with searches"
          value={activeDays}
          sub={`of the last ${roomsByDay.length}`}
        />
      </div>
    </section>
  );
}
