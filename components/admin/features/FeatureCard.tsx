import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { FeatureCardData } from '../../../lib/adminFeatureStats';
import type { AdminFeature } from '../../../lib/adminFeatures';

export default function FeatureCard({
  feature,
  card,
  roomsSang,
  onOpen,
}: {
  feature: AdminFeature;
  card: FeatureCardData;
  roomsSang: number;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <button type="button" className={styles.featureCard} onClick={onOpen}>
      <span className={styles.featureCardHead}>
        <span className={styles.featureCardName}>{feature.name}</span>
        <span className={styles.featureCardLink}>See rooms</span>
      </span>
      <span className={styles.featureCardStats}>
        <span className={styles.featureStat}>
          <span className={styles.featureStatLabel}>Used</span>
          <span className={styles.featureStatValue}>{card.rooms}</span>
          <span className={styles.featureStatSub}>
            of {roomsSang} that sang
          </span>
        </span>
        <span className={styles.featureStat}>
          <span className={styles.featureStatLabel}>{card.stat.label}</span>
          <span className={styles.featureStatValue}>{card.stat.value}</span>
          <span className={styles.featureStatSub}>{card.stat.sub}</span>
        </span>
        <span className={styles.featureStat}>
          <span className={styles.featureStatLabel}>Came back</span>
          <span className={styles.featureStatValue}>
            {card.hosts > 0 ? `${card.hostsReturned} of ${card.hosts}` : '—'}
          </span>
          <span className={styles.featureStatSub}>
            {card.hosts > 0 ? 'hosts hosted again' : 'no host on record'}
          </span>
        </span>
      </span>
    </button>
  );
}
