import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DayBilledWire, DayRoomsWire } from '../types';
import StackedColumnChart, { type StackedSeries } from '../charts/StackedColumnChart';
import StatTile from '../charts/StatTile';
import { SERIES } from '../charts/palette';
import { formatDay } from './day';

const BILLED_SERIES: StackedSeries[] = [
  { name: 'Rooms', color: SERIES[0] },
  { name: 'Nightly corpus', color: SERIES[1] },
  { name: 'Mop-up', color: SERIES[2] },
  { name: 'Unlogged', color: SERIES[3] },
];

function total(d: DayBilledWire): number {
  return d.rooms + d.nightly + d.mopUp + d.unlogged;
}

function sum(days: DayBilledWire[], pick: (d: DayBilledWire) => number): number {
  return days.reduce((acc, d) => acc + pick(d), 0);
}

function fromRooms(roomsByDay: DayRoomsWire[]): DayBilledWire[] {
  return roomsByDay.map((d) => ({
    day: d.day,
    recorded: false,
    out: false,
    rooms: d.searches,
    nightly: 0,
    mopUp: 0,
    unlogged: 0,
  }));
}

export default function QuotaHistory({
  billedByDay,
  roomsByDay,
  quota,
  selectedDay,
  onSelectDay,
}: {
  billedByDay: DayBilledWire[] | undefined;
  roomsByDay: DayRoomsWire[];
  quota: number;
  selectedDay: string;
  onSelectDay: (day: string) => void;
}): React.ReactElement {
  const days = billedByDay ?? fromRooms(roomsByDay);
  const thisWeek = days.slice(-7);
  const lastWeek = days.slice(-14, -7);
  const corpus = (d: DayBilledWire) => d.nightly + d.mopUp;
  const atQuota = days.filter((d) => d.out).length;
  const recordedDays = days.filter((d) => d.recorded).length;
  const selectedIndex = days.findIndex((d) => d.day === selectedDay);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>YouTube searches, last 30 days</h2>
      <p className={styles.cardNote}>
        Every search YouTube billed, by who spent it. Rooms search first; the
        corpus job resolves song suggestions at night, and the mop-up spends
        what&rsquo;s left in the day&rsquo;s last 15 minutes. Tap a day to see
        its rooms and what the mop-up found.
      </p>
      <div className={styles.cardChart}>
        <StackedColumnChart
          data={days.map((d) => ({
            label: formatDay(d.day),
            title: formatDay(d.day, true),
            note: d.recorded
              ? undefined
              : 'Rooms only: the ledger no longer holds this day, and room events undercount.',
            segments: [d.rooms, d.nightly, d.mopUp, d.unlogged],
          }))}
          series={BILLED_SERIES}
          height={140}
          reference={{ value: quota, label: `quota ${quota}` }}
          ariaLabel="YouTube searches per day by source, last 30 days"
          selected={selectedIndex >= 0 ? selectedIndex : undefined}
          onSelect={(i) => onSelectDay(days[i].day)}
        />
      </div>
      <div className={styles.tileGrid}>
        <StatTile
          label="This week"
          value={sum(thisWeek, total)}
          sub={`${sum(lastWeek, total)} the week before`}
          spark={thisWeek.map(total)}
        />
        <StatTile
          label="Corpus job this week"
          value={sum(thisWeek, corpus)}
          sub={`${sum(thisWeek, (d) => d.nightly)} nightly · ${sum(thisWeek, (d) => d.mopUp)} mop-up`}
        />
        <StatTile
          label="Days at quota"
          value={atQuota}
          sub={`of the ${recordedDays} the ledger holds`}
        />
      </div>
    </section>
  );
}
