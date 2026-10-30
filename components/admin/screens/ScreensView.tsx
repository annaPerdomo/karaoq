import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import viz from '../../../styles/AdminViz.module.css';
import { SCREENS_WINDOWS, type ScreensStats, type ScreensWindow } from './types';
import { hasActivity } from './labels';
import MusicVideoSection from './MusicVideoSection';
import BrandSection from './BrandSection';
import FeatureFeedback from './FeatureFeedback';

export default function ScreensView({
  secret,
  refreshToken = 0,
}: {
  secret: string;
  refreshToken?: number;
}): React.ReactElement {
  const [days, setDays] = React.useState<ScreensWindow>(30);
  const [stats, setStats] = React.useState<ScreensStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(
    async (isLive: () => boolean = () => true) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/analytics/screens?days=${days}`, {
          headers: { 'x-analytics-secret': secret },
        });
        if (!res.ok) throw new Error('failed');
        const next: ScreensStats = await res.json();
        if (!isLive()) return;
        setStats(next);
      } catch {
        if (!isLive()) return;
        setFailed(true);
        setStats(null);
      }
      setLoading(false);
    },
    [secret, days]
  );

  // A response for a window the admin has since left must not overwrite the current one.
  React.useEffect(() => {
    let live = true;
    load(() => live);
    return () => {
      live = false;
    };
  }, [load, refreshToken]);

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Screens</h1>
          <p className={styles.viewSub}>
            The music-video screen and club branding: who uses them, whether
            they work, and what people say. Days are UTC.
          </p>
        </div>
      </header>

      <div className={viz.chartControls}>
        <div className={viz.chartPicker} role="group" aria-label="Window">
          {SCREENS_WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              className={`${viz.chartPick} ${d === days ? viz.chartPickOn : ''}`}
              aria-pressed={d === days}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {loading && <p className={styles.empty}>Reading screen events…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the screen stats.
          <button type="button" className={styles.retryBtn} onClick={() => load()}>
            Retry
          </button>
        </p>
      )}

      {stats && !loading && !hasActivity(stats) && (
        <p className={styles.empty}>
          No music-video screen or branding activity in the last {stats.days} days.
        </p>
      )}

      {stats && !loading && hasActivity(stats) && (
        <>
          <MusicVideoSection stats={stats.musicVideo} days={stats.days} />
          <BrandSection stats={stats.brand} days={stats.days} />
          <FeatureFeedback entries={stats.feedback} />
        </>
      )}
    </div>
  );
}
