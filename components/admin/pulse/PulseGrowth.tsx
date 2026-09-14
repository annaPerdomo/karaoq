import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import viz from '../../../styles/AdminViz.module.css';
import type { AnalyticsData, GrowthData } from '../types';
import { bucketWeeks, fillDaysStacked, type StackedDatum } from '../chartData';
import { VIA_LABELS, WINDOW } from '../format';
import StackedColumnChart, { type StackedSeries } from '../charts/StackedColumnChart';
import { SERIES } from '../charts/palette';

type Metric = 'rooms' | 'songs';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'songs', label: 'Songs queued' },
];

// Multiples of 7 so bucketWeeks never drops a week; none may exceed GROWTH_WINDOW_DAYS.
const WINDOWS = [
  { id: '30d', label: WINDOW.last30, days: 30, weekly: false },
  { id: '12w', label: 'Last 12 weeks', days: 84, weekly: true },
  { id: '26w', label: 'Last 26 weeks', days: 182, weekly: true },
] as const;

type WindowId = (typeof WINDOWS)[number]['id'];

const ROOM_SERIES: StackedSeries[] = [
  { name: 'Queued a song', color: SERIES[0] },
  { name: 'No songs', color: SERIES[1] },
];

function songSeries(rows: GrowthData['songs']): { keys: string[]; series: StackedSeries[] } {
  const seen = new Set(rows.flatMap((r) => Object.keys(r.via)));
  const known = Object.keys(VIA_LABELS).filter((k) => seen.has(k));
  const extra = Array.from(seen).filter((k) => !(k in VIA_LABELS)).sort();
  const keys = [...known, ...extra];
  return {
    keys,
    series: keys.map((k, i) => ({
      name: VIA_LABELS[k] ?? k,
      color: SERIES[Math.min(i, SERIES.length - 1)],
    })),
  };
}

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}): React.ReactElement {
  return (
    <div className={viz.chartPicker} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`${viz.chartPick} ${o.id === value ? viz.chartPickOn : ''}`}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PulseGrowth({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement | null {
  const [metric, setMetric] = React.useState<Metric>('rooms');
  const [windowId, setWindowId] = React.useState<WindowId>('30d');
  const growth = data.growth;
  if (!growth) return null;

  const win = WINDOWS.find((w) => w.id === windowId) ?? WINDOWS[0];
  const days = Math.min(win.days, growth.windowDays);

  let series: StackedSeries[];
  let daily: StackedDatum[];
  if (metric === 'rooms') {
    series = ROOM_SERIES;
    daily = fillDaysStacked(growth.rooms, days, 2, (r) => [
      r.withSong,
      r.rooms - r.withSong,
    ]);
  } else {
    const s = songSeries(growth.songs);
    series = s.series;
    daily = fillDaysStacked(growth.songs, days, s.keys.length, (r) =>
      s.keys.map((k) => r.via[k] ?? 0)
    );
  }
  const chartData = win.weekly ? bucketWeeks(daily) : daily;
  const unit = win.weekly ? 'week' : 'day';

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Growth · {win.label}</h2>
      <div className={viz.chartControls}>
        <Picker label="Metric" options={METRICS} value={metric} onChange={setMetric} />
        <Picker label="Window" options={WINDOWS} value={windowId} onChange={setWindowId} />
      </div>
      <StackedColumnChart
        data={chartData}
        series={series}
        ariaLabel={`${metric === 'rooms' ? 'Rooms created' : 'Songs queued'} per ${unit}`}
      />
      <p className={`${styles.cardNote} ${styles.cardNoteAfterTiles}`}>
        {metric === 'rooms'
          ? `One bar per ${unit}, by when the room was created — split into rooms that queued at least one song and rooms that never did.`
          : `One bar per ${unit}, split by how each song was added.`}
        {win.weekly && ' The newest week ends today.'}
      </p>
    </section>
  );
}
