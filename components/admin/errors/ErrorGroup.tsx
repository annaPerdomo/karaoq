import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ErrorGroupData } from '../types';
import { ERROR_SOURCE_LABELS, formatTimestamp } from '../format';
import { fillDays } from '../chartData';
import Sparkline from '../charts/Sparkline';
import { STATUS } from '../charts/palette';

export default function ErrorGroup({
  group,
  windowDays,
  onOpenRoom,
}: {
  group: ErrorGroupData;
  windowDays: number;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const trend = fillDays(group.byDay, Math.min(windowDays, 30)).map((d) => d.value);

  return (
    <div className={styles.errorGroup}>
      <button
        type="button"
        className={styles.errorGroupHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.errorGroupMessage}>{group.message}</span>
        <span className={styles.errorGroupMeta}>
          <span className={styles.dsBadge}>
            {ERROR_SOURCE_LABELS[group.source] ?? group.source}
          </span>
          <span className={styles.errorGroupSpark}>
            <Sparkline data={trend} color={STATUS.critical} />
          </span>
          <span className={`${styles.dsBadge} ${styles.dsBadgeError}`}>
            ×{group.count}
          </span>
          <span className={styles.errorGroupWhen}>
            last {formatTimestamp(group.lastSeen)}
          </span>
        </span>
      </button>

      {open && (
        <div className={styles.errorGroupBody}>
          <div className={styles.errorGroupFacts}>
            <span>First seen {formatTimestamp(group.firstSeen)}</span>
            {group.samplePage && <span>Page: {group.samplePage}</span>}
            <span>
              {group.roomCount === 0
                ? 'Outside any room'
                : `${group.roomCount} room${group.roomCount === 1 ? '' : 's'} affected`}
            </span>
          </div>
          {group.rooms.length > 0 && (
            <div className={styles.errorGroupRooms}>
              {group.rooms.map((roomId) => (
                <button
                  key={roomId}
                  className={styles.roomJumpChip}
                  onClick={() => onOpenRoom(roomId)}
                  title={`Open ${roomId} in the Rooms view`}
                >
                  {roomId}
                </button>
              ))}
              {group.roomCount > group.rooms.length && (
                <span className={styles.errorGroupWhen}>
                  +{group.roomCount - group.rooms.length} more
                </span>
              )}
            </div>
          )}
          {group.sampleStack && (
            <pre className={styles.errorStack}>{group.sampleStack}</pre>
          )}
        </div>
      )}
    </div>
  );
}
