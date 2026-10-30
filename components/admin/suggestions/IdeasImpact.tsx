import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { IdeasImpact as IdeasImpactData } from '../../../lib/ideasImpact';
import { pct } from '../format';
import ColumnChart from '../charts/ColumnChart';
import StatTile from '../charts/StatTile';

/** Measured 2026-10-24, before the Hot tab and place picker shipped. */
const BASELINE_SHARE = 6;

const SURFACE_LABELS: Record<string, string> = {
  hot: '🔥 Hot chart',
  rooms: '🎤 Rooms list',
  genre: '🎵 Genre lists',
  genre_chart: '📈 Live genre charts',
  voice: '🎙️ Voice lists',
  random: '🎲 Surprise me',
  unknown: 'Before surfaces were recorded',
};

function where(away: boolean | null): string {
  if (away === null) return '—';
  return away ? 'Another country' : 'Their own';
}

function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function IdeasImpact({ secret }: { secret: string }): React.ReactElement {
  const [data, setData] = React.useState<IdeasImpactData | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/analytics/ideas', { headers: { 'x-analytics-secret': secret } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((payload: IdeasImpactData) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [secret]);

  if (failed) return <p className={styles.cardNote}>Couldn&rsquo;t load the ideas impact report.</p>;
  if (!data) return <p className={styles.cardNote}>Loading the ideas impact report…</p>;

  const lastWeek = data.weeks[data.weeks.length - 1];
  const prevWeek = data.weeks[data.weeks.length - 2];
  const taps = data.surfaces.reduce((sum, s) => sum + s.taps, 0);
  const adds = data.surfaces.reduce((sum, s) => sum + s.adds, 0);
  const away = data.surfaces.filter((s) => s.away === true);
  const awayTaps = away.reduce((sum, s) => sum + s.taps, 0);

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Is the ideas redesign working?</h2>
        <p className={styles.cardNote}>
          Share of all songs added that came from song ideas, week by week. The
          baseline before the Hot tab and place picker was {BASELINE_SHARE}%; a
          working redesign shows as a step up from the week it shipped.
        </p>
        <div className={styles.tileGrid}>
          <StatTile
            label="Ideas share, this week"
            value={lastWeek && lastWeek.adds > 0 ? `${pct(lastWeek.ideas, lastWeek.adds)}%` : '—'}
            sub={prevWeek && prevWeek.adds > 0 ? `last week ${pct(prevWeek.ideas, prevWeek.adds)}% · baseline ${BASELINE_SHARE}%` : `baseline ${BASELINE_SHARE}%`}
          />
          <StatTile
            label="Idea taps → adds (30 days)"
            value={taps > 0 ? `${pct(adds, taps)}%` : '—'}
            sub={`${adds} adds from ${taps} song taps`}
          />
          <StatTile
            label="Taps on another country"
            value={taps > 0 ? `${pct(awayTaps, taps)}%` : '—'}
            sub="of song taps, via the place picker"
          />
        </div>
        <ColumnChart
          data={data.weeks.map((w) => ({
            label: weekLabel(w.weekStart),
            value: w.adds > 0 ? Math.round((100 * w.ideas) / w.adds) : 0,
          }))}
        />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Which surfaces turn taps into songs (last 30 days)</h2>
        <p className={styles.cardNote}>
          A song tap on each surface, and how many idea adds came from it. Taps and
          adds aren&rsquo;t linked one to one, so the rate is a ratio, not a funnel.
        </p>
        <div className={styles.quotaScroll}>
          <table className={styles.quotaTable}>
            <thead>
              <tr>
                <th>Surface</th>
                <th>Browsing</th>
                <th>Taps</th>
                <th>Adds</th>
                <th>Adds per tap</th>
              </tr>
            </thead>
            <tbody>
              {data.surfaces.map((s) => (
                <tr key={`${s.surface}:${s.away}`}>
                  <td>{SURFACE_LABELS[s.surface] ?? s.surface}</td>
                  <td>{where(s.away)}</td>
                  <td>{s.taps}</td>
                  <td>{s.adds}</td>
                  <td>{s.taps > 0 ? `${pct(s.adds, s.taps)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
