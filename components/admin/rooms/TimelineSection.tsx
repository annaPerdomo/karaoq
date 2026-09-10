import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import { SEARCH_RUNS_CAP } from '../types';
import type { DossierSongRow, RoomErrorRow, RoomSearchFailRow, RoomSearchRow } from '../types';
import { ERROR_SOURCE_LABELS, searchFailLabel } from '../format';
import { pickTitle, songTitleLabel, VIA_LABELS } from '../roomDetailLabels';
import { Section } from './DossierSections';
import { entryKind, mergeTimeline, searchRunLabel, timeLabel, type TimelineKind } from './timeline';

/** Errors sit inline at their real time: a queue stalling right after one is
 * the pattern this exists to show. */
export function TimelineSection({
  songs,
  searchRuns,
  errors,
  errorTotal,
  searchFails,
}: {
  songs: DossierSongRow[];
  searchRuns: RoomSearchRow[];
  errors: RoomErrorRow[];
  /** Uncapped count, which can exceed the rows the API returns. */
  errorTotal: number;
  searchFails: RoomSearchFailRow[];
}): React.ReactElement {
  const [active, setActive] = React.useState<Set<TimelineKind>>(
    new Set<TimelineKind>(['song', 'search', 'problem'])
  );

  const entries = mergeTimeline({ songs, searchRuns, errors, searchFails });
  const visible = entries.filter((entry) => active.has(entryKind(entry)));

  const chips: { kind: TimelineKind; label: string; title?: string }[] = [
    { kind: 'song', label: `Queued (${songs.length})` },
    {
      kind: 'search',
      label: `Searches (${searchRuns.length})`,
      title:
        searchRuns.length >= SEARCH_RUNS_CAP
          ? `Showing the ${SEARCH_RUNS_CAP} most recent searches`
          : undefined,
    },
    { kind: 'problem', label: `Problems (${errorTotal + searchFails.length})` },
  ];

  function toggle(kind: TimelineKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size === 1) return prev;
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  const rows: React.ReactElement[] = [];
  let lastDay = '';
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!active.has(entryKind(entry))) continue;
    const day = new Date(entry.at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    if (day !== lastDay) {
      lastDay = day;
      rows.push(
        <div key={`day-${day}-${i}`} className={styles.tlDay}>
          {day}
        </div>
      );
    }
    if (entry.kind === 'song') {
      const s = entry.song;
      const title = songTitleLabel(s.songTitle, s.timestamp) || 'Untitled';
      rows.push(
        <div key={`song-${i}`} className={styles.tlRow}>
          <span className={styles.tlTime}>{timeLabel(entry.at)}</span>
          <span className={styles.tlMain}>
            <span className={styles.dsRowTitle} title={title}>{title}</span>
            <span className={styles.dsRowMeta}>{s.userName || 'Anonymous'}</span>
          </span>
          <span
            className={`${styles.dsBadge} ${
              s.singers && s.singers >= 2
                ? styles.dsBadgeDuet
                : s.via === 'ideas'
                  ? styles.dsBadgeIdea
                  : ''
            }`}
            title={pickTitle(s)}
          >
            {s.singers && s.singers >= 2
              ? `${VIA_LABELS[s.via] || s.via} · ${s.singers} singers`
              : VIA_LABELS[s.via] || s.via}
          </span>
        </div>
      );
    } else if (entry.kind === 'search') {
      const s = entry.search;
      const { cache, live, meta } = searchRunLabel(s);
      rows.push(
        <div key={`search-${i}`} className={`${styles.tlRow} ${styles.tlSearchRow}`}>
          <span className={styles.tlTime}>{timeLabel(entry.at)}</span>
          <span className={styles.tlMain}>
            <span className={styles.dsRowTitle} title={s.query}>🔍 {s.query || '(empty query)'}</span>
            {meta && <span className={styles.dsRowMeta}>{meta}</span>}
          </span>
          <span className={`${styles.dsBadge} ${live ? styles.dsBadgeSearchLive : styles.dsBadgeSearch}`}>{cache}</span>
        </div>
      );
    } else if (entry.kind === 'error') {
      const e = entry.error;
      rows.push(
        <div key={`err-${i}`} className={`${styles.tlRow} ${styles.tlErrorRow}`}>
          <span className={styles.tlTime}>{timeLabel(entry.at)}</span>
          <span className={styles.tlMain}>
            <span className={styles.tlErrorMessage} title={e.message}>
              ⚠ {e.message}
            </span>
            <span className={styles.dsRowMeta}>
              {[ERROR_SOURCE_LABELS[e.source] ?? e.source, e.page ?? null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className={`${styles.dsBadge} ${styles.dsBadgeError}`}>error</span>
        </div>
      );
    } else {
      const f = entry.fail;
      const label = searchFailLabel(f.failReason, f.searchOutcome);
      rows.push(
        <div key={`sf-${i}`} className={`${styles.tlRow} ${styles.tlWarnRow}`}>
          <span className={styles.tlTime}>{timeLabel(entry.at)}</span>
          <span className={styles.tlMain}>
            <span className={styles.tlWarnMessage} title={label}>
              ⚠ Search failed — {label.toLowerCase()}
            </span>
          </span>
        </div>
      );
    }
  }

  return (
    <Section
      title="Timeline"
      wide
      extra={
        <>
          {errorTotal > 0 && (
            <span
              className={`${styles.dsSectionCount} ${styles.dsSectionCountError}`}
              title={
                errorTotal > errors.length
                  ? `Showing the ${errors.length} most recent of ${errorTotal}`
                  : undefined
              }
            >
              {errorTotal} {errorTotal === 1 ? 'error' : 'errors'}
            </span>
          )}
          {searchFails.length > 0 && (
            <span className={`${styles.dsSectionCount} ${styles.dsSectionCountWarn}`}>
              {searchFails.length} failed{' '}
              {searchFails.length === 1 ? 'search' : 'searches'}
            </span>
          )}
        </>
      }
    >
      <div className={styles.tlFilters}>
        {chips.map(({ kind, label, title }) => (
          <button
            key={kind}
            type="button"
            className={`${styles.tlFilter} ${active.has(kind) ? styles.tlFilterOn : ''}`}
            aria-pressed={active.has(kind)}
            aria-disabled={active.size === 1 && active.has(kind)}
            title={title}
            onClick={() => toggle(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className={styles.dsEmpty}>No songs were added or searched for.</p>
      ) : visible.length === 0 ? (
        <p className={styles.dsEmpty}>Nothing matches these filters.</p>
      ) : (
        <div className={`${styles.dsRows} ${styles.tlRows}`}>{rows}</div>
      )}
    </Section>
  );
}
