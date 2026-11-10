import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import { ADMIN_FEATURES } from '../../../lib/adminFeatures';
import { LIVE_EXPLANATION } from '../format';

const LIVE_TIP_ID = 'rooms-live-tip';

export default function RoomsFilters({
  query,
  liveOnly,
  liveCount,
  feature,
  onQueryChange,
  onLiveChange,
  onFeatureChange,
}: {
  query: string;
  liveOnly: boolean;
  liveCount: number;
  feature: string | null;
  onQueryChange: (q: string) => void;
  onLiveChange: (live: boolean) => void;
  onFeatureChange: (feature: string | null) => void;
}): React.ReactElement {
  return (
    <div className={styles.roomsFilters}>
      <input
        type="search"
        className={styles.roomSearch}
        placeholder="Find a room code…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search rooms by code"
      />
      <div className={styles.filterRow} role="group" aria-label="Filter rooms">
        <button
          type="button"
          className={`${styles.filterChip} ${
            !liveOnly && !feature ? styles.filterChipOn : ''
          }`}
          aria-pressed={!liveOnly && !feature}
          onClick={() => {
            onLiveChange(false);
            onFeatureChange(null);
          }}
        >
          All
        </button>
        {/* Kept mounted while filtering even at zero, so the last room going
            dormant can't strand the operator in an empty filtered list. */}
        {(liveCount > 0 || liveOnly) && (
          <span className={styles.liveToggleWrap}>
            <button
              type="button"
              className={`${styles.filterChip} ${styles.filterChipLive} ${
                liveOnly ? styles.filterChipOn : ''
              }`}
              onClick={() => onLiveChange(!liveOnly)}
              aria-pressed={liveOnly}
              aria-describedby={LIVE_TIP_ID}
            >
              ● {liveCount} live
            </button>
            <span role="tooltip" id={LIVE_TIP_ID} className={styles.liveTip}>
              {LIVE_EXPLANATION}
            </span>
          </span>
        )}
        {ADMIN_FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${feature === f.id ? styles.filterChipOn : ''}`}
            aria-pressed={feature === f.id}
            onClick={() => onFeatureChange(feature === f.id ? null : f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
