import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { LogoRejectReason, ScreensStats } from './types';
import { pct } from '../format';
import StatTile from '../charts/StatTile';
import BarList from '../charts/BarList';
import { REJECT_LABELS, STORAGE_WARN_SHARE, formatBytes } from './labels';

const REJECT_ORDER: LogoRejectReason[] = ['type', 'size', 'storage_full'];

export default function BrandSection({
  stats,
  days,
}: {
  stats: ScreensStats['brand'];
  days: number;
}): React.ReactElement {
  const storagePct = pct(stats.storageBytes, stats.storageBudgetBytes);
  const rejected = REJECT_ORDER.reduce((sum, r) => sum + stats.rejected[r], 0);

  return (
    <>
      <h2 className={styles.sectionHeading}>Club branding · Last {days} days</h2>
      <div className={styles.tileGrid}>
        <StatTile label="Rooms with a logo" value={stats.roomsWithLogo} sub={`${stats.uploads} uploads`} />
        <StatTile
          label="Rooms with colors"
          value={stats.roomsWithColors}
          sub={`${stats.clears} cleared the brand`}
        />
        <StatTile
          label="Logo storage"
          value={`${formatBytes(stats.storageBytes)} of ${formatBytes(stats.storageBudgetBytes)}`}
          sub={`${storagePct}% used · ${stats.committedLogos} committed logos`}
          tone={
            stats.storageBytes >= stats.storageBudgetBytes * STORAGE_WARN_SHARE
              ? 'warning'
              : undefined
          }
        />
        <StatTile label="Uploads rejected" value={rejected} />
      </div>

      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Why uploads were rejected</h2>
          <BarList
            data={REJECT_ORDER.map((r) => ({ label: REJECT_LABELS[r], value: stats.rejected[r] }))}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Brand saves by rail</h2>
          <BarList
            data={[
              { label: 'Host', value: stats.saves.host },
              { label: 'Display', value: stats.saves.display },
            ]}
          />
        </section>
      </div>
    </>
  );
}
