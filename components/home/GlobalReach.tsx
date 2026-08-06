import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import type { PublicStats } from '../../lib/publicStats';
import WorldDotMap from './WorldDotMap';
import useInView from './hooks/useInView';

// Counts up from 0 once `start` flips true. Snaps straight to target instead
// of animating under prefers-reduced-motion, or before the section is in view.
function useCountUp(target: number | null, start: boolean, durationMs = 1100): number {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    if (target == null) return;
    if (
      !start ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      setValue(target);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, durationMs]);

  return value;
}

interface StatProps {
  value: number | null;
  start: boolean;
  /** Real figures are rounded down, so they're shown as "1,300+", not "1,300". */
  approximate?: boolean;
  label: string;
}

function Stat({ value, start, approximate, label }: StatProps) {
  const { locale } = useT();
  const shown = useCountUp(value, start);
  if (value == null) return null;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale).format(shown);
  } catch {
    formatted = String(shown);
  }
  return (
    <div className={styles.reachStat}>
      <span className={styles.reachValue}>
        {formatted}
        {approximate && '+'}
      </span>
      <span className={styles.reachLabel}>{label}</span>
    </div>
  );
}

export interface GlobalReachProps {
  stats: PublicStats;
}

// Renders nothing at all when every figure is below its floor — an empty
// band beats one bragging about 40 songs.
export default function GlobalReach({ stats }: GlobalReachProps) {
  const { t } = useT();
  const [ref, inView] = useInView<HTMLDivElement>(0.15);

  const hasStats = stats.songs != null || stats.cheers != null || stats.countries != null;
  if (!hasStats) return null;

  const showMap = stats.countries != null && stats.countryCodes.length > 0;

  return (
    <section className={styles.reachSection} ref={ref}>
      <div className={`${styles.reachInner} ${inView ? styles.reachInnerVisible : ''}`}>
        <h2 className={styles.reachTitle}>{t('home.reach.title')}</h2>
        <p className={styles.reachSub}>{t('home.reach.sub')}</p>

        {showMap && (
          <div className={styles.reachMapWrap}>
            <WorldDotMap
              countryCodes={stats.countryCodes}
              label={t('home.reach.mapLabel', { count: stats.countries! })}
              play={inView}
            />
          </div>
        )}

        <div className={styles.reachStats}>
          <Stat
            value={stats.songs}
            start={inView}
            approximate
            label={t('home.proof.songs')}
          />
          <Stat
            value={stats.countries}
            start={inView}
            label={t('home.proof.countries')}
          />
          <Stat
            value={stats.cheers}
            start={inView}
            approximate
            label={t('home.proof.cheers')}
          />
        </div>
      </div>
    </section>
  );
}
