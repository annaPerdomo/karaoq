import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ErrorsData, SearchHealthData } from '../types';
import { ERROR_SOURCE_LABELS, formatTimestamp } from '../format';
import StatTile from '../charts/StatTile';
import ErrorGroup from './ErrorGroup';
import SearchHealthCard from './SearchHealthCard';

/** Tones follow volume here: quiet is good. */
export default function ErrorsView({
  errors,
  searchHealth,
  loading,
  onRetry,
  onOpenRoom,
}: {
  errors: ErrorsData | null;
  searchHealth?: SearchHealthData;
  loading: boolean;
  onRetry: () => void;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Errors</h1>
          <p className={styles.viewSub}>
            Uncaught client errors and search failures, grouped by what broke.
          </p>
        </div>
      </header>

      {!errors ? (
        <p className={styles.empty}>
          {loading ? 'Loading…' : (
            <>
              Couldn&rsquo;t load errors.{' '}
              <button className={styles.retryBtn} onClick={onRetry}>Retry</button>
            </>
          )}
        </p>
      ) : (
        <>
          <div className={styles.tileGrid}>
            <StatTile
              label="Last 24 hours"
              value={errors.totals.last24h}
              tone={errors.totals.last24h > 0 ? 'critical' : 'good'}
            />
            <StatTile
              label="Last 7 days"
              value={errors.totals.last7d}
              tone={errors.totals.last7d > 0 ? 'serious' : 'good'}
            />
            <StatTile
              label={`Last ${errors.windowDays} days`}
              value={errors.totals.total}
            />
            <StatTile
              label="Rooms affected"
              value={errors.totals.roomsAffected}
              sub={`of rooms with errors, last ${errors.windowDays} days`}
            />
          </div>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              Client errors (last {errors.windowDays} days)
            </h2>
            {errors.groups.length === 0 ? (
              <p className={styles.empty}>
                Not a single client error in {errors.windowDays} days. 🎉
              </p>
            ) : (
              <div className={styles.errorGroups}>
                {errors.groups.map((g, i) => (
                  <ErrorGroup
                    key={`${g.source}-${g.message}-${i}`}
                    group={g}
                    windowDays={errors.windowDays}
                    onOpenRoom={onOpenRoom}
                  />
                ))}
              </div>
            )}
          </section>

          {errors.recent.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Latest occurrences</h2>
              <div className={styles.recentErrors}>
                {errors.recent.map((r, i) => (
                  <div key={i} className={styles.recentErrorRow}>
                    <span className={styles.recentErrorWhen}>
                      {formatTimestamp(r.timestamp)}
                    </span>
                    {r.roomId ? (
                      <button
                        className={styles.errorRoomChip}
                        onClick={() => onOpenRoom(r.roomId)}
                        title={`Open ${r.roomId} in the Rooms view — its timeline shows this error in context`}
                      >
                        {r.roomId}
                      </button>
                    ) : (
                      <span className={styles.recentErrorNoRoom}>no room</span>
                    )}
                    <span className={styles.recentErrorMessage} title={r.message}>
                      {r.message}
                    </span>
                    <span className={styles.recentErrorMeta}>
                      {[ERROR_SOURCE_LABELS[r.source] ?? r.source, r.page ?? null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {searchHealth && <SearchHealthCard health={searchHealth} />}
        </>
      )}
    </div>
  );
}
