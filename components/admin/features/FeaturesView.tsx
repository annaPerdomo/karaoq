import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import viz from '../../../styles/AdminViz.module.css';
import { ADMIN_FEATURES } from '../../../lib/adminFeatures';
import {
  FEATURES_WINDOWS,
  type FeaturesStats,
  type FeaturesWindow,
} from '../../../lib/adminFeatureStats';
import FeatureCard from './FeatureCard';

export default function FeaturesView({
  secret,
  refreshToken,
  onOpenFeature,
}: {
  secret: string;
  refreshToken: number;
  onOpenFeature: (featureId: string) => void;
}): React.ReactElement {
  const [days, setDays] = React.useState<FeaturesWindow>(30);
  const [stats, setStats] = React.useState<FeaturesStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const [retries, setRetries] = React.useState(0);

  // Retry bumps `retries` rather than fetching itself, so its response is
  // dropped like any other once the window has changed.
  React.useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/analytics/features?days=${days}`, {
      headers: { 'x-analytics-secret': secret },
    })
      .then((res) => {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((next: FeaturesStats) => {
        if (!live) return;
        setStats(next);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        setStats(null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [secret, days, refreshToken, retries]);

  const cards = stats
    ? ADMIN_FEATURES.flatMap((feature) => {
        const card = stats.features.find((c) => c.id === feature.id);
        return card ? [{ feature, card }] : [];
      })
    : [];

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Features</h1>
          <p className={styles.viewSub}>
            What you built, who used it, and whether they hosted again. Tap a card for its rooms.
          </p>
        </div>
        <div className={viz.chartPicker} role="group" aria-label="Window">
          {FEATURES_WINDOWS.map((d) => (
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
      </header>

      {loading && <p className={styles.empty}>Counting feature use…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the feature stats.
          <button type="button" className={styles.retryBtn} onClick={() => setRetries((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}

      {stats && !loading && (
        <>
          <p className={styles.featuresLead}>
            {stats.roomsSang} {stats.roomsSang === 1 ? 'room' : 'rooms'} sang in the last{' '}
            {stats.days} days. Of all {stats.baseline.hosts} hosts in that time,{' '}
            {stats.baseline.returned} hosted again: compare each card&rsquo;s &ldquo;came
            back&rdquo; with that.
          </p>
          <div className={styles.featureGrid}>
            {cards.map(({ feature, card }) => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                card={card}
                roomsSang={stats.roomsSang}
                onOpen={() => onOpenFeature(feature.id)}
              />
            ))}
          </div>
          <p className={styles.featuresNote}>
            A host is one browser, traced through the rooms it hosted over the last 90 days;
            a night is songs queued at least 12 hours after the last ones. Small numbers are
            hints about which rooms to open, not proof.
          </p>
        </>
      )}
    </div>
  );
}
