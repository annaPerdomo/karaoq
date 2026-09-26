import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DayRoomsWire, DaySpendWire } from '../types';
import StatTile from '../charts/StatTile';
import type { StatusTone } from '../charts/palette';

function tone(searches: number, quota: number): StatusTone {
  if (searches >= quota) return 'critical';
  if (searches >= quota * 0.8) return 'warning';
  return 'good';
}

export default function QuotaToday({
  ledger,
  rooms,
  quota,
  resetsAt,
}: {
  ledger: DaySpendWire | undefined;
  rooms: DayRoomsWire | undefined;
  quota: number;
  resetsAt: string | undefined;
}): React.ReactElement {
  const searches = ledger?.searches ?? 0;
  const cron = ledger?.cronSearches ?? 0;
  const roomSearches = searches - cron - (ledger?.unloggedSearches ?? 0);
  const left = Math.max(0, quota - searches);
  const resets = resetsAt ? new Date(resetsAt) : null;
  // Fetched once, never polled: a countdown would freeze at 0m, a clock time stays true.
  const stale = resets ? Date.now() >= resets.getTime() : false;
  const resetsLocal = resets
    ? resets.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Today</h2>
      <div className={styles.tileGrid}>
        <StatTile
          label="Searches used"
          value={searches}
          sub={`of ${quota} · ${roomSearches} by rooms, ${cron} by the corpus job`}
          tone={tone(searches, quota)}
        />
        <StatTile
          label="Rooms that searched"
          value={rooms?.roomCount ?? 0}
          sub="rooms whose singers hit YouTube today"
        />
        <StatTile
          label="Left today"
          value={stale ? 'reset' : left}
          sub={stale ? 'refresh for the new day' : `resets at ${resetsLocal}, your time`}
          tone={stale ? 'warning' : undefined}
        />
      </div>
      <p className={`${styles.cardNote} ${styles.cardNoteAfterTiles}`}>
        A search only counts when YouTube answered it live. Repeats of a recent
        search come from our cache and cost nothing. Days roll over at midnight
        Pacific.
      </p>
    </section>
  );
}
