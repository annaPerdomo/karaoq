import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DaySpendWire, QuotaLedgerData } from '../types';
import StatTile from '../charts/StatTile';

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function mopUpCell(day: DaySpendWire): string {
  const mopUp = day.mopUp;
  if (!mopUp) return '—';
  if (mopUp.skipped) {
    return mopUp.liveRooms > 0
      ? `${mopUp.skipped} · ${mopUp.liveRooms} rooms live`
      : mopUp.skipped;
  }
  let cell = `bought ${mopUp.filled} of ${mopUp.searched}`;
  if (mopUp.liveRooms > 0) cell += ` · ${mopUp.liveRooms} rooms live`;
  if (mopUp.quotaSpent) cell += ' · drained the day';
  if (mopUp.error) cell += ` · failed: ${mopUp.error}`;
  return cell;
}

export default function QuotaLedger({
  secret,
}: {
  secret: string;
}): React.ReactElement {
  const [data, setData] = React.useState<QuotaLedgerData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/analytics/quota', {
        headers: { 'x-analytics-secret': secret },
      });
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    } catch {
      setFailed(true);
      setData(null);
    }
    setLoading(false);
  }, [secret]);

  React.useEffect(() => {
    load();
  }, [load]);

  const today = data?.days[data.days.length - 1];
  const ranNights = data?.days.filter((d) => d.mopUp && !d.mopUp.skipped).length ?? 0;
  const filledTotal = data?.days.reduce((sum, d) => sum + (d.mopUp?.filled ?? 0), 0) ?? 0;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Search quota, last 7 days</h2>
      <p className={styles.cardNote}>
        Every search.list call against Google&rsquo;s daily quota &mdash; rooms
        first, the cron after, the mop-up last.
      </p>

      {loading && <p className={styles.empty}>Reading the ledger…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the quota ledger.
          <button type="button" className={styles.retryBtn} onClick={load}>
            Retry
          </button>
        </p>
      )}

      {data && !loading && (
        <>
          <div className={styles.tileGrid}>
            <StatTile
              label="Spent today"
              value={today?.searches ?? 0}
              sub={`of ${data.quota}`}
            />
            <StatTile
              label="Mop-up bought, 7 days"
              value={filledTotal}
              sub={`${ranNights} nights ran`}
            />
          </div>
          <div className={styles.quotaScroll}>
            <table className={styles.quotaTable}>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Rooms</th>
                  <th scope="col">Cron</th>
                  <th scope="col">Total / quota</th>
                  <th scope="col">Mop-up</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr key={day.day}>
                    <td>
                      {formatDay(day.day)}
                      {day.day === data.today ? ' (today)' : ''}
                    </td>
                    <td>{day.searches - day.cronSearches}</td>
                    <td>{day.cronSearches}</td>
                    <td className={day.searches >= data.quota ? styles.quotaOverTotal : undefined}>
                      {day.searches} / {data.quota}
                    </td>
                    <td>{mopUpCell(day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
