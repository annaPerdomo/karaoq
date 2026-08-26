import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DossierSongRow, RoomErrorRow, RoomSearchFailRow } from '../types';
import { ERROR_SOURCE_LABELS, searchFailLabel } from '../format';
import {
  formatTime,
  languageLabel,
  locationLabel,
  pickTitle,
  songTitleLabel,
  SWM_LABELS,
  VIA_LABELS,
  type Person,
  type RequestRow,
  type SingWithMeRow,
} from '../roomDetailLabels';

export function DossierRow({
  title,
  badge,
  badgeClass,
  meta,
}: {
  title: string;
  badge?: string;
  badgeClass?: string;
  meta: (string | null)[];
}): React.ReactElement {
  return (
    <div className={styles.dsRow}>
      <div className={styles.dsRowMain}>
        <span className={styles.dsRowTitle} title={title}>{title}</span>
        {badge && (
          <span className={`${styles.dsBadge} ${badgeClass ?? ''}`}>{badge}</span>
        )}
      </div>
      <div className={styles.dsRowMeta}>
        {meta.filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

export function Section({
  title,
  count,
  extra,
  wide,
  children,
}: {
  title: string;
  count?: number;
  /** Second header badge, e.g. the timeline's error count. */
  extra?: React.ReactNode;
  /** Span the full dossier width instead of one grid column. */
  wide?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={`${styles.dsSection} ${wide ? styles.dsSectionWide : ''}`}>
      <h3 className={styles.dsSectionTitle}>
        {title}
        {typeof count === 'number' && (
          <span className={styles.dsSectionCount}>{count}</span>
        )}
        {extra}
      </h3>
      {children}
    </section>
  );
}

export function PeopleSection({
  people,
  wide,
}: {
  people: Person[];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section title="People" count={people.length} wide={wide}>
      {people.length === 0 ? (
        <p className={styles.dsEmpty}>No one joined this room.</p>
      ) : (
        <div className={styles.dsRows}>
          {people.map((p, i) => (
            <DossierRow
              key={i}
              title={p.userName || 'Anonymous'}
              badge={p.role ?? undefined}
              badgeClass={p.role === 'host' ? styles.dsBadgeHost : undefined}
              meta={[locationLabel(p), languageLabel(p), formatTime(p.firstSeen)]}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

type TimelineEntry =
  | { kind: 'song'; at: number; song: DossierSongRow }
  | { kind: 'error'; at: number; error: RoomErrorRow }
  | { kind: 'searchFail'; at: number; fail: RoomSearchFailRow };

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Errors sit inline at their real time: a queue stalling right after one is
 * the pattern this exists to show. */
export function TimelineSection({
  songs,
  errors,
  errorTotal,
  searchFails,
}: {
  songs: DossierSongRow[];
  errors: RoomErrorRow[];
  /** Uncapped count, which can exceed the rows the API returns. */
  errorTotal: number;
  searchFails: RoomSearchFailRow[];
}): React.ReactElement {
  const entries: TimelineEntry[] = [
    ...songs.map((song): TimelineEntry => ({
      kind: 'song',
      at: new Date(song.timestamp).getTime(),
      song,
    })),
    ...errors.map((error): TimelineEntry => ({
      kind: 'error',
      at: new Date(error.timestamp).getTime(),
      error,
    })),
    ...searchFails.map((fail): TimelineEntry => ({
      kind: 'searchFail',
      at: new Date(fail.timestamp).getTime(),
      fail,
    })),
  ].sort((a, b) => a.at - b.at);

  const rows: React.ReactElement[] = [];
  let lastDay = '';
  entries.forEach((entry, i) => {
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
  });

  return (
    <Section
      title="Timeline"
      count={songs.length}
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
      {entries.length === 0 ? (
        <p className={styles.dsEmpty}>No songs were added.</p>
      ) : (
        <div className={`${styles.dsRows} ${styles.tlRows}`}>{rows}</div>
      )}
    </Section>
  );
}

export function BoardsSection({
  requests,
  singWithMe,
  wide,
}: {
  requests: RequestRow[];
  singWithMe: SingWithMeRow[];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section
      title="Requests & sing with me"
      count={requests.length + singWithMe.length}
      wide={wide}
    >
      <div className={styles.dsRows}>
        {requests.map((r, i) => (
          <DossierRow
            key={`req-${i}`}
            title={songTitleLabel(r.songTitle, r.timestamp)}
            badge="Request"
            meta={[r.userName || 'Anonymous', formatTime(r.timestamp)]}
          />
        ))}
        {singWithMe.map((s, i) => (
          <DossierRow
            key={`swm-${i}`}
            title={songTitleLabel(s.songTitle, s.timestamp)}
            badge={`Sing with me · ${SWM_LABELS[s.kind] || s.kind}`}
            meta={[s.userName || 'Anonymous', formatTime(s.timestamp)]}
          />
        ))}
      </div>
    </Section>
  );
}
