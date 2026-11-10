import * as React from 'react';
import styles from '../../../styles/Admin.module.css';

export default function RoomsListEnd({
  count,
  liveOnly,
  loading,
  failed,
  hasMore,
  onRetry,
}: {
  count: number;
  liveOnly: boolean;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  onRetry: () => void;
}): React.ReactElement | null {
  if (loading) return <p className={styles.empty}>Loading…</p>;
  if (failed) {
    return (
      <p className={styles.empty}>
        Couldn&rsquo;t load more rooms.{' '}
        <button className={styles.retryBtn} onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  }
  if (hasMore) return null;
  return (
    <p className={styles.roomsEnd}>
      {count} {liveOnly ? 'live ' : ''}
      {count === 1 ? 'room' : 'rooms'}
    </p>
  );
}
