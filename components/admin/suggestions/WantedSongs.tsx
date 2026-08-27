import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { WantedSongRow, WantedSongsData } from '../types';
import { pct } from '../format';
import StatTile from '../charts/StatTile';
import WantedRow from './WantedRow';

const PAGE_LIMIT = 50;

type Rank = 'breadth' | 'volume';

/** The only demand signal that can name a song we're missing: a tap needs a
 *  shelf, and an add needs the video to have been found already. */
export default function WantedSongs({
  secret,
}: {
  secret: string;
}): React.ReactElement {
  const [data, setData] = React.useState<WantedSongsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [rank, setRank] = React.useState<Rank>('breadth');
  const [gapsOnly, setGapsOnly] = React.useState(true);

  // Each toggle refetches, and the replies can land out of order: a breadth
  // payload arriving last would render "40x" against a country-ranked list.
  const request = React.useRef(0);

  const load = React.useCallback(async () => {
    const mine = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/analytics/wanted?limit=${PAGE_LIMIT}&rank=${rank}&gaps=${gapsOnly ? '1' : '0'}`,
        { headers: { 'x-analytics-secret': secret } }
      );
      if (!res.ok) throw new Error('failed');
      const payload = await res.json();
      if (mine !== request.current) return;
      setData(payload);
    } catch {
      if (mine !== request.current) return;
      setFailed(true);
      setData(null);
    }
    // Left alone when a newer request has taken over: it is still loading.
    if (mine === request.current) setLoading(false);
  }, [secret, rank, gapsOnly]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;
  const free = totals ? totals.served + totals.corpus + totals.stale : 0;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>What rooms are searching for</h2>
      <p className={styles.cardNote}>
        Every search typed into the box, counted per query rather than per room.
        Ranked by how many countries asked for it, because a song wanted in six
        places is worth a search and one room asking forty times is not. A row
        with no cuts is a song we make somebody pay YouTube for, every time.
      </p>

      {totals && (
        <div className={styles.tileGrid}>
          <StatTile
            label="Distinct songs asked for"
            value={totals.queries}
            sub={`${totals.searches} searches in all`}
          />
          <StatTile
            label="Answered without YouTube"
            value={free}
            tone={
              totals.searches > 0 && free / totals.searches > 0.8
                ? 'good'
                : undefined
            }
            sub={
              totals.searches > 0
                ? `${pct(free, totals.searches)}% of searches — cache and corpus`
                : undefined
            }
          />
          <StatTile
            label="Live searches spent"
            value={totals.spent}
            sub="one of the day's hundred, each"
          />
          <StatTile
            label="Came back empty"
            value={totals.error}
            tone={totals.error > 0 ? 'serious' : undefined}
            sub={
              totals.searches > 0
                ? `${pct(totals.error, totals.searches)}% of searches got nothing`
                : undefined
            }
          />
        </div>
      )}

      <div className={styles.wantedFilters}>
        <Toggle on={rank === 'breadth'} onClick={() => setRank('breadth')}>
          Most countries
        </Toggle>
        <Toggle on={rank === 'volume'} onClick={() => setRank('volume')}>
          Most searched
        </Toggle>
        {/* Fixed, unlike the state it used to swap to: aria-pressed makes the
            label the thing being turned on, so a swapping one announces the
            opposite of what is showing. */}
        <Toggle on={gapsOnly} onClick={() => setGapsOnly((v) => !v)}>
          Gaps only
        </Toggle>
      </div>

      {loading && <p className={styles.empty}>Reading the ledger…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the demand ledger.
          <button type="button" className={styles.retryBtn} onClick={load}>
            Retry
          </button>
        </p>
      )}
      {data && !loading && data.rows.length === 0 && (
        <p className={styles.empty}>
          {gapsOnly
            ? 'Nothing asked for that the corpus cannot already answer. 🎉'
            : 'Nobody has searched yet.'}
        </p>
      )}
      {data && !loading && data.rows.length > 0 && (
        <>
          <div className={styles.rankList}>
            {data.rows.map((row: WantedSongRow, i: number) => (
              <WantedRow key={row.key} row={row} position={i + 1} rank={rank} />
            ))}
          </div>
          {data.matched > data.rows.length && (
            <p className={styles.cardNote}>
              Showing the top {data.rows.length} of {data.matched}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${styles.wantedToggle} ${on ? styles.wantedToggleOn : ''}`}
    >
      {children}
    </button>
  );
}
