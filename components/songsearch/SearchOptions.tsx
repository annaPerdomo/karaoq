import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SearchFilters } from '../../app/queue/searchYoutube';
import { useT } from '../../lib/i18n/I18nProvider';
import { DURATION_OPTIONS, SORT_OPTIONS } from './constants';

interface SearchOptionsProps {
  karaokeMode: boolean;
  onToggleKaraoke: () => void;
  showFilters: boolean;
  filters: SearchFilters;
  onUpdateFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
}

const SearchOptions: React.FC<SearchOptionsProps> = ({
  karaokeMode,
  onToggleKaraoke,
  showFilters,
  filters,
  onUpdateFilter,
}) => {
  const { t } = useT();

  return (
    <div className={styles.options}>
      <label className={styles.toggleRow}>
        <span className={styles.toggleLabel}>{t('search.autoAddKaraoke')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={karaokeMode}
          className={`${styles.toggle} ${karaokeMode ? styles.toggleOn : ''}`}
          onClick={onToggleKaraoke}
        >
          <span className={styles.toggleKnob} />
        </button>
      </label>

      {showFilters && (
        <div className={styles.filterSection}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{t('search.duration')}</span>
            <div className={styles.filterChips}>
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.filterChip} ${
                    filters.duration === opt.value ? styles.filterChipActive : ''
                  }`}
                  onClick={() => onUpdateFilter('duration', opt.value)}
                >
                  {t(opt.tKey)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{t('search.sortBy')}</span>
            <div className={styles.filterChips}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.filterChip} ${
                    filters.sortBy === opt.value ? styles.filterChipActive : ''
                  }`}
                  onClick={() => onUpdateFilter('sortBy', opt.value)}
                >
                  {t(opt.tKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchOptions;
