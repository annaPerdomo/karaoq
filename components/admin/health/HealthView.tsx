import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type {
  ErrorsData,
  LinkLookupData,
  QuotaLedgerData,
  SearchHealthData,
} from '../types';
import ErrorsView from '../errors/ErrorsView';
import HealthSummary from './HealthSummary';

export default function HealthView({
  secret,
  refreshToken,
  errors,
  searchHealth,
  linkLookups,
  errorsLoading,
  onRetryErrors,
  onOpenRoom,
  onOpenQuota,
}: {
  secret: string;
  refreshToken: number;
  errors: ErrorsData | null;
  searchHealth?: SearchHealthData;
  linkLookups?: LinkLookupData;
  errorsLoading: boolean;
  onRetryErrors: () => void;
  onOpenRoom: (roomId: string) => void;
  onOpenQuota: () => void;
}): React.ReactElement {
  const [quota, setQuota] = React.useState<QuotaLedgerData | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch('/api/analytics/quota', { headers: { 'x-analytics-secret': secret } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (live) setQuota(json);
      })
      .catch(() => {
        if (live) setQuota(null);
      });
    return () => {
      live = false;
    };
  }, [secret, refreshToken]);

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Health</h1>
          <p className={styles.viewSub}>
            Is anything broken right now? Tap the quota card for the full ledger.
          </p>
        </div>
      </header>
      <HealthSummary
        errors={errors}
        searchHealth={searchHealth}
        quota={quota}
        onOpenQuota={onOpenQuota}
      />
      <ErrorsView
        errors={errors}
        searchHealth={searchHealth}
        linkLookups={linkLookups}
        loading={errorsLoading}
        onRetry={onRetryErrors}
        onOpenRoom={onOpenRoom}
      />
    </div>
  );
}
