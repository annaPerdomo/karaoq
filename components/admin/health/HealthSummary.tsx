import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ErrorsData, QuotaLedgerData, SearchHealthData } from '../types';

export type HealthSection = 'errors' | 'quota';

interface Status {
  ok: boolean;
  word: string;
}

function Card({
  title,
  status,
  value,
  sub,
  active,
  onOpen,
}: {
  title: string;
  status: Status | null;
  value: string;
  sub: string;
  active: boolean;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${styles.healthCard} ${status && !status.ok ? styles.healthCardAlert : ''} ${
        active ? styles.healthCardActive : ''
      }`}
      onClick={onOpen}
      aria-pressed={active}
    >
      <span className={styles.healthCardHead}>
        <span className={styles.healthCardTitle}>{title}</span>
        {status && (
          <span className={status.ok ? styles.healthOk : styles.healthAlert}>{status.word}</span>
        )}
      </span>
      <span className={styles.healthCardValue}>{value}</span>
      <span className={styles.healthCardSub}>{sub}</span>
    </button>
  );
}

export default function HealthSummary({
  errors,
  searchHealth,
  quota,
  section,
  onSection,
}: {
  errors: ErrorsData | null;
  searchHealth?: SearchHealthData;
  quota: QuotaLedgerData | null;
  section: HealthSection;
  onSection: (section: HealthSection) => void;
}): React.ReactElement {
  const today = quota?.days[quota.days.length - 1];
  const used = today?.searches ?? 0;
  const allowance = quota?.quota ?? 0;
  const usedPct = allowance > 0 ? Math.round((used / allowance) * 100) : 0;
  const quotaStatus: Status | null = !quota
    ? null
    : used >= allowance
      ? { ok: false, word: 'Out for today' }
      : used >= allowance * 0.8
        ? { ok: false, word: 'Running low' }
        : { ok: true, word: 'Fine' };
  const failed = searchHealth?.last24h ?? 0;

  return (
    <div className={styles.healthGrid}>
      <Card
        title="Errors"
        status={
          errors
            ? errors.totals.last24h > 0
              ? { ok: false, word: 'Needs a look' }
              : { ok: true, word: 'Fine' }
            : null
        }
        value={errors ? String(errors.totals.last24h) : '—'}
        sub={
          errors
            ? `client errors in 24 hours · ${errors.totals.last7d} in 7 days`
            : 'client errors in 24 hours'
        }
        active={section === 'errors'}
        onOpen={() => onSection('errors')}
      />
      <Card
        title="YouTube quota"
        status={quotaStatus}
        value={quota ? `${usedPct}%` : '—'}
        sub={quota ? `${used} of ${allowance} searches used today` : 'of today’s searches used'}
        active={section === 'quota'}
        onOpen={() => onSection('quota')}
      />
      <Card
        title="Search"
        status={
          searchHealth
            ? failed > 0
              ? { ok: false, word: 'Needs a look' }
              : { ok: true, word: 'Fine' }
            : null
        }
        value={searchHealth ? String(failed) : '—'}
        sub="failed searches in 24 hours"
        active={false}
        onOpen={() => onSection('errors')}
      />
    </div>
  );
}
