import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ReturningData } from '../../../pages/api/analytics/returning';
import { adminFeature } from '../../../lib/adminFeatures';
import { countryFlag, safeDecode, timeAgo } from '../format';

const COLLAPSED_ROWS = 2;

function place(row: ReturningData['rows'][number]): string {
  const where = row.city
    ? `${safeDecode(row.city)}, ${row.country ?? ''}`.replace(/, $/, '')
    : (row.country ?? 'Location unknown');
  return `${countryFlag(row.country)} ${where}`.trim();
}

function firstNightText(ids: string[]): string {
  const labels = ids
    .map((id) => adminFeature(id))
    .filter((f) => f && !f.noChip)
    .map((f) => f!.label.toLowerCase());
  return labels.length > 0 ? `First night used: ${labels.join(', ')}` : 'First night: songs only';
}

export default function CameBackCard({
  secret,
  refreshToken,
  hidden,
  onOpenRoom,
}: {
  secret: string;
  refreshToken: number;
  /** Hide, don't unmount: a remount repeats the admin's heaviest read. */
  hidden: boolean;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement | null {
  const [data, setData] = React.useState<ReturningData | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch('/api/analytics/returning', { headers: { 'x-analytics-secret': secret } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (live) setData(json);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, [secret, refreshToken]);

  if (!data || hidden) return null;
  const rows = showAll ? data.rows : data.rows.slice(0, COLLAPSED_ROWS);

  return (
    <section className={styles.cameBack} aria-label="Hosts who came back">
      <div className={styles.cameBackHead}>
        <h2 className={styles.cameBackTitle}>Came back</h2>
        <span className={styles.cameBackWindow}>Last {data.windowDays} days</span>
      </div>
      <p className={styles.cameBackLead}>
        <span className={styles.cameBackValue}>{data.returning}</span>
        <span>
          {data.returning === 1 ? 'host' : 'hosts'} hosted again · {data.firstTime} hosted for
          the first time
        </span>
      </p>
      {rows.length > 0 && (
        <ul className={styles.cameBackRows}>
          {rows.map((row) => (
            <li key={`${row.roomId}-${row.lastNightAt}`}>
              <button
                type="button"
                className={styles.cameBackRow}
                onClick={() => onOpenRoom(row.roomId)}
              >
                <span className={styles.cameBackWho}>
                  {place(row)} · night {row.nights}
                  <span className={styles.cameBackRoom}>{row.roomId}</span>
                </span>
                <span className={styles.cameBackNote}>
                  {firstNightText(row.firstFeatures)} · last sang {timeAgo(row.lastNightAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          className={styles.cameBackMore}
          onClick={() => setShowAll((all) => !all)}
        >
          {showAll
            ? 'Show fewer'
            : data.returning > data.rows.length
              ? `See the latest ${data.rows.length}`
              : `See all ${data.rows.length}`}
        </button>
      )}
    </section>
  );
}
