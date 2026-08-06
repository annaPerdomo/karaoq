import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  karaokeMode: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  onSearch,
  searching,
  karaokeMode,
}) => {
  const { t } = useT();

  return (
    <div className={styles.searchBar}>
      <input
        className={styles.searchInput}
        type="text"
        placeholder={karaokeMode ? t('search.placeholder.karaoke') : t('search.placeholder.youtube')}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
      />
      <button
        className={styles.searchBtn}
        onClick={onSearch}
        disabled={!query.trim() || searching}
      >
        {t('search.button')}
      </button>
      {/* Slim branded progress bar — absolutely positioned so it signals an
          in-flight search (including filter-change refreshes that keep the
          current results on screen) without nudging the layout. */}
      {searching && <span className={styles.searchProgress} aria-hidden="true" />}
    </div>
  );
};

export default SearchBar;
