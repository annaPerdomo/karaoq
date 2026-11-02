import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ProposalRow as ProposalRowData, ProposalsData } from '../types';
import ProposalRow from './ProposalRow';

const PAGE_LIMIT = 50;

type View = 'pending' | 'promoted' | 'rejected' | 'unnamed';

const TABS: { view: View; label: string }[] = [
  { view: 'pending', label: 'Pending' },
  { view: 'promoted', label: 'Promoted' },
  { view: 'rejected', label: 'Rejected' },
  { view: 'unnamed', label: 'Needs a name' },
];

export default function Proposals({ secret }: { secret: string }): React.ReactElement {
  const [view, setView] = React.useState<View>('pending');
  const [data, setData] = React.useState<ProposalsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  // Each tab refetches, and the replies can land out of order: a pending
  // payload arriving after a tab switch would render against the wrong tab.
  const request = React.useRef(0);

  const load = React.useCallback(async () => {
    const mine = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/analytics/proposals?view=${view}&limit=${PAGE_LIMIT}`, {
        headers: { 'x-analytics-secret': secret },
      });
      if (!res.ok) throw new Error('failed');
      const payload = await res.json();
      if (mine !== request.current) return;
      setData(payload);
    } catch {
      if (mine !== request.current) return;
      setFailed(true);
      setData(null);
    }
    if (mine === request.current) setLoading(false);
  }, [secret, view]);

  React.useEffect(() => {
    load();
  }, [load]);

  function removeRow(id: string): void {
    setData((prev) => (prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== id) } : prev));
  }

  async function approve(id: string, identity: { artist: string; title: string }) {
    const res = await fetch('/api/analytics/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-analytics-secret': secret },
      body: JSON.stringify({ id, action: 'approve', artist: identity.artist, title: identity.title }),
    });
    if (!res.ok) throw new Error('failed');
    return res.json();
  }

  async function reject(id: string) {
    const res = await fetch('/api/analytics/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-analytics-secret': secret },
      body: JSON.stringify({ id, action: 'reject' }),
    });
    if (!res.ok) throw new Error('failed');
    return res.json();
  }

  const thresholds = data?.thresholds;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Song proposals</h2>
      <p className={styles.cardNote}>
        Proposals with {thresholds?.minRooms ?? '—'}+ rooms or {thresholds?.minCountries ?? '—'}+
        countries join the corpus automatically each night.
      </p>

      <div className={styles.wantedFilters}>
        {TABS.map((tab) => (
          <button
            key={tab.view}
            type="button"
            aria-pressed={view === tab.view}
            onClick={() => setView(tab.view)}
            className={`${styles.wantedToggle} ${
              view === tab.view ? styles.wantedToggleOn : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className={styles.empty}>Reading the proposals…</p>}
      {failed && (
        <p className={styles.empty}>
          Couldn&rsquo;t read the proposals.
          <button type="button" className={styles.retryBtn} onClick={load}>
            Retry
          </button>
        </p>
      )}
      {data && !loading && data.rows.length === 0 && (
        <p className={styles.empty}>Nothing here.</p>
      )}
      {data && !loading && data.rows.length > 0 && (
        <div className={styles.rankList}>
          {data.rows.map((row: ProposalRowData) => (
            <ProposalRow
              key={row.id}
              row={row}
              view={view}
              onApprove={approve}
              onReject={reject}
              onRemove={removeRow}
            />
          ))}
        </div>
      )}
    </section>
  );
}
