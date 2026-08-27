import * as React from 'react';
import styles from '../../styles/Admin.module.css';
import type { AnalyticsData } from './types';
import { SECTION_LABELS, SOURCE_LABELS, pct } from './format';
import { fillDays } from './chartData';
import StatTile from './charts/StatTile';
import ColumnChart from './charts/ColumnChart';
import BarList from './charts/BarList';
import { SERIES } from './charts/palette';
import CorpusPicks from './suggestions/CorpusPicks';
import WantedSongs from './suggestions/WantedSongs';

/** Top picks are our own catalog titles, so this list isn't bound by the
 * 30-day YouTube retention window that caps the Pulse song ranking. */
export default function SuggestionsView({
  data,
  secret,
  onOpenRoom,
}: {
  data: AnalyticsData;
  secret: string;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  const { suggestions } = data;

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Suggestions</h1>
          <p className={styles.viewSub}>
            How people find something to sing when they don&rsquo;t know what to sing
            &mdash; how often the shelves, not the search box, end up filling the
            queue, and which songs the search box is still being asked for.
          </p>
        </div>
      </header>

      <h2 className={styles.sectionHeading}>Filling the gaps</h2>

      <WantedSongs secret={secret} />

      {suggestions.picks && (
        <CorpusPicks
          picks={suggestions.picks}
          songsByDay={data.charts.songsByDay}
          onOpenRoom={onOpenRoom}
        />
      )}

      <h2 className={styles.sectionHeading}>Browsing the ideas</h2>

      <div className={styles.tileGrid}>
        <StatTile
          label="Total uses"
          value={suggestions.total}
          spark={fillDays(suggestions.byDay, 30).map((d) => d.value)}
        />
        {suggestions.bySource.map((s) => (
          <StatTile
            key={s._id ?? 'unknown'}
            label={(s._id && SOURCE_LABELS[s._id]) || s._id || 'Unknown'}
            value={s.count}
            sub={
              suggestions.total > 0
                ? `${pct(s.count, suggestions.total)}% of uses`
                : undefined
            }
          />
        ))}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Uses per day (last 30 days)</h2>
        <ColumnChart
          data={fillDays(suggestions.byDay, 30)}
          ariaLabel="Suggestion uses per day, last 30 days"
        />
      </section>

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>By section</h2>
          <BarList
            data={suggestions.bySection.map((d) => ({
              label: SECTION_LABELS[d._id] ?? d._id,
              value: d.count,
            }))}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top categories</h2>
          <BarList
            color={SERIES[2]}
            data={suggestions.byCategory.map((d) => ({
              label: d._id,
              value: d.count,
            }))}
            maxRows={12}
          />
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Most-picked suggested songs</h2>
        {suggestions.topSongs.length === 0 ? (
          <p className={styles.empty}>No song suggestions clicked yet</p>
        ) : (
          <div className={styles.rankList}>
            {suggestions.topSongs.map((s, i) => (
              <div key={i} className={styles.rankRow}>
                <span className={styles.rankNum}>#{i + 1}</span>
                <span className={styles.rankMain}>
                  <span className={styles.rankTitle}>{s._id.title}</span>
                  <span className={styles.rankSub}>{s._id.artist}</span>
                </span>
                <span className={styles.rankCount}>{s.count}×</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
