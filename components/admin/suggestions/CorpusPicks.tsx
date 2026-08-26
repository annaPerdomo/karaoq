import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { CorpusPicksData } from '../types';
import type { DayCount } from '../chartData';
import { fillDays } from '../chartData';
import { PACK_LABELS, countryFlag, formatTimestamp, pct } from '../format';
import StatTile from '../charts/StatTile';
import ColumnChart from '../charts/ColumnChart';
import BarList from '../charts/BarList';
import { SERIES } from '../charts/palette';

const WINDOW_DAYS = 30;
/** Share of asked-for picks going to search above which it's a coverage gap
 *  rather than the ordinary long tail — a count would light the tile forever. */
const FALLBACK_WARN_SHARE = 0.25;

function total(days: { value: number }[]): number {
  return days.reduce((sum, d) => sum + d.value, 0);
}

function shelfLabel(packId: string | null, categoryId: string | null): string {
  const pack = packId ? PACK_LABELS[packId] ?? packId : null;
  return [pack, categoryId].filter(Boolean).join(' · ');
}

/**
 * Songs picked off a shelf AND queued, where the suggestion_used panels count
 * taps alone. A tap the corpus can't fill still spends the search it exists to
 * save, so the pick and who answered it are counted apart.
 */
export default function CorpusPicks({
  picks,
  songsByDay,
  onOpenRoom,
}: {
  picks: CorpusPicksData;
  songsByDay: DayCount[];
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  const pickDays = fillDays(picks.byDay, WINDOW_DAYS);
  const picksInWindow = total(pickDays);
  const addsInWindow = total(fillDays(songsByDay, WINDOW_DAYS));
  // A pick the corpus was never asked to fill can't vote on how well it fills.
  const attributed = picks.corpusServed + picks.searchFallback;

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>From the shelves into the queue</h2>
        <p className={styles.cardNote}>
          Songs a singer picked off a shelf and actually queued, rather than typing
          a search of their own. Every one of these posts through the search
          endpoint, so they are counted here by the catalogue key that rode along
          with the add.
        </p>
        <div className={styles.tileGrid}>
          <StatTile
            label="Queued from ideas"
            value={picks.total}
            spark={pickDays.map((d) => d.value)}
            sub={
              addsInWindow > 0
                ? `${pct(picksInWindow, addsInWindow)}% of adds in the last ${WINDOW_DAYS} days`
                : undefined
            }
          />
          <StatTile
            label="Served by the corpus"
            value={picks.corpusServed}
            tone={attributed > 0 && picks.corpusServed === attributed ? 'good' : undefined}
            sub={
              attributed > 0
                ? `${pct(picks.corpusServed, attributed)}% of attributed picks — no YouTube search spent`
                : 'nothing attributed yet'
            }
          />
          <StatTile
            label="Fell through to search"
            value={picks.searchFallback}
            tone={
              attributed > 0 && picks.searchFallback / attributed > FALLBACK_WARN_SHARE
                ? 'warning'
                : undefined
            }
            sub={
              attributed > 0
                ? `${pct(picks.searchFallback, attributed)}% of attributed picks spent a live search`
                : 'nothing attributed yet'
            }
          />
          <StatTile
            label="Rooms picking"
            value={picks.rooms}
            sub="rooms that queued at least one"
          />
        </div>
        {picks.unattributed > 0 && (
          <p className={styles.cardNote}>
            {picks.unattributed} of these never put the question to the corpus —
            an add from before the split was recorded, or a tap whose filters
            sent it straight to search. They count as picks and nothing more.
          </p>
        )}
      </section>

      {picks.total > 0 && (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              Shelf picks queued per day (last {WINDOW_DAYS} days)
            </h2>
            <ColumnChart
              data={pickDays}
              color={SERIES[2]}
              ariaLabel={`Songs queued from the shelves per day, last ${WINDOW_DAYS} days`}
            />
          </section>

          <div className={styles.cardPair}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Where the picking happens</h2>
              <BarList
                color={SERIES[2]}
                data={picks.byCountry.map((c) => ({
                  label: `${countryFlag(c._id)} ${c._id}`,
                  value: c.count,
                }))}
                maxRows={12}
              />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Most-queued shelf songs</h2>
              <div className={styles.rankList}>
                {picks.topSongs.map((s, i) => (
                  <div key={s.key} className={styles.rankRow}>
                    <span className={styles.rankNum}>#{i + 1}</span>
                    <span className={styles.rankMain}>
                      <span className={styles.rankTitle}>{s.title}</span>
                      <span className={styles.rankSub}>
                        {[s.artist, shelfLabel(s.packId, s.categoryId)]
                          .filter(Boolean)
                          .join(' — ')}
                      </span>
                    </span>
                    <span
                      className={styles.rankCount}
                      title={`${s.count} adds across ${s.rooms} rooms`}
                    >
                      {s.count}× / {s.rooms} rooms
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Latest shelf picks</h2>
            <div className={styles.recentErrors}>
              {picks.recent.map((p, i) => (
                <div key={i} className={styles.pickRow}>
                  <span className={styles.recentErrorWhen}>
                    {formatTimestamp(p.timestamp)}
                  </span>
                  <button
                    className={styles.roomJumpChip}
                    onClick={() => onOpenRoom(p.roomId)}
                    title={`Open ${p.roomId} in the Rooms view`}
                  >
                    {countryFlag(p.country)} {p.roomId}
                  </button>
                  <span className={styles.pickSong}>
                    <span className={styles.pickTitle}>
                      {p.title}
                      {p.artist ? <span className={styles.rankSub}> — {p.artist}</span> : null}
                    </span>
                    <span className={styles.recentErrorMeta}>
                      {[p.userName, shelfLabel(p.packId, p.categoryId)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`${styles.dsBadge} ${styles.pickVerdict} ${
                      p.fromCorpus === true ? styles.dsBadgeIdea : ''
                    }`}
                    title={
                      p.fromCorpus === true
                        ? 'Served from our corpus — no YouTube search spent'
                        : p.fromCorpus === false
                          ? 'The corpus couldn’t answer, so the tap spent a live search'
                          : 'The corpus was never asked — a filtered tap, or an add from before this was recorded'
                    }
                  >
                    {p.fromCorpus === true
                      ? 'corpus'
                      : p.fromCorpus === false
                        ? 'searched'
                        : 'unknown'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
