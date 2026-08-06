import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import {
  SongCategory,
  SongSuggestion,
  displaySongTitle,
  displaySongArtist,
} from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';
import { labelWithFallback } from './labelWithFallback';

interface CategorySongListProps {
  category: SongCategory;
  /** Full song list for the category — used for the "show all N" count. */
  songs: SongSuggestion[];
  /** Slice of `songs` currently revealed (respects `expanded`). */
  visible: SongSuggestion[];
  hasMore: boolean;
  expanded: boolean;
  onBack: () => void;
  onExpand: () => void;
  onSongSelect: (song: SongSuggestion) => void;
}

const CategorySongList: React.FC<CategorySongListProps> = ({
  category,
  songs,
  visible,
  hasMore,
  expanded,
  onBack,
  onExpand,
  onSongSelect,
}) => {
  const { t } = useT();

  return (
    <>
      <div className={styles.songPanelHead}>
        <button
          className={styles.backBtn}
          onClick={onBack}
        >
          &larr;
        </button>
        <span className={styles.songPanelTitle}>
          <span>{category.emoji}</span> {labelWithFallback(t, `category.${category.id}`, category.name)}
        </span>
      </div>
      <div className={styles.songPanel}>
        {visible.map((song, i) => (
          <button
            key={`${song.artist}-${song.title}`}
            className={`${styles.songRow} ${i % 2 === 1 ? styles.songRowAlt : ''}`}
            onClick={() => onSongSelect(song)}
          >
            <span className={styles.songNum}>{i + 1}</span>
            <span className={styles.songRowTitle}>{displaySongTitle(song)}</span>
            <span className={styles.songRowArtist}>{displaySongArtist(song)}</span>
          </button>
        ))}
        {hasMore && !expanded && (
          <button
            className={styles.showMoreBtn}
            onClick={onExpand}
          >
            {t('search.showAll', { count: songs.length })}
          </button>
        )}
      </div>
    </>
  );
};

export default CategorySongList;
