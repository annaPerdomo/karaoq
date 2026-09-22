import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { QuotaLedgerData } from '../types';
import QuotaToday from './QuotaToday';
import QuotaCache from './QuotaCache';
import QuotaHistory from './QuotaHistory';
import QuotaRooms from './QuotaRooms';
import QuotaLedger from './QuotaLedger';

export default function QuotaView({
  secret,
  onOpenRoom,
}: {
  secret: string;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  const [ledger, setLedger] = React.useState<QuotaLedgerData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/analytics/quota', {
        headers: { 'x-analytics-secret': secret },
      });
      if (!res.ok) throw new Error('failed');
      setLedger(await res.json());
    } catch {
      setFailed(true);
      setLedger(null);
    }
    setLoading(false);
  }, [secret]);

  React.useEffect(() => {
    load();
  }, [load]);

  const roomsByDay = ledger?.roomsByDay ?? [];
  const today = ledger?.today ?? '';
  const day = roomsByDay.find((d) => d.day === (selectedDay ?? today));
  const todayRooms = roomsByDay[roomsByDay.length - 1];

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Quota</h1>
          <p className={styles.viewSub}>
            Everything KaraoQ asks YouTube for. YouTube gives us{' '}
            {ledger?.quota ?? 100} searches a day: how today&rsquo;s are going,
            which rooms are using them, and how much the cache saves.
          </p>
        </div>
      </header>

      {loading && <p className={styles.empty}>Reading the ledger…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the quota ledger.
          <button type="button" className={styles.retryBtn} onClick={load}>
            Retry
          </button>
        </p>
      )}

      {ledger && !loading && (
        <>
          <QuotaToday
            ledger={ledger.days[ledger.days.length - 1]}
            rooms={todayRooms}
            quota={ledger.quota}
            resetsAt={ledger.resetsAt}
          />
          {roomsByDay.length > 0 && (
            <QuotaHistory
              roomsByDay={roomsByDay}
              selectedDay={day?.day ?? today}
              onSelectDay={setSelectedDay}
            />
          )}
          {day && <QuotaRooms day={day} today={today} onOpenRoom={onOpenRoom} />}
          {ledger.sourcesByDay && <QuotaCache sourcesByDay={ledger.sourcesByDay} />}
          <QuotaLedger data={ledger} />
        </>
      )}
    </div>
  );
}
