import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import rowStyles from '../../styles/IdeaRows.module.css';
import type { GenreShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import { categoryLabel } from './labelWithFallback';
import { INITIAL_CATEGORY_SONGS } from './constants';
import { displayName } from './ShelfSection';
import SongRow from './SongRow';

interface GenreShelfListProps {
  genre: GenreShelf;
  onBack: () => void;
  onSelect: (song: ShelfSong) => void;
}

function useSourceLine(genre: GenreShelf): string {
  const { t, locale } = useT();
  const line = t('ideas.source.genre', {
    genre: genre.name,
    country: displayName(genre.store, 'region', locale),
  });
  let date = '';
  try {
    date = genre.updatedAt
      ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(genre.updatedAt))
      : '';
  } catch {}
  return date ? `${line} · ${t('ideas.source.updated', { date })}` : line;
}

const GenreShelfList: React.FC<GenreShelfListProps> = ({ genre, onBack, onSelect }) => {
  const { t } = useT();
  const source = useSourceLine(genre);
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? genre.songs : genre.songs.slice(0, INITIAL_CATEGORY_SONGS);

  return (
    <>
      <div className={styles.songPanelHead}>
        <button className={styles.backBtn} onClick={onBack}>
          &larr;
        </button>
        <span className={styles.songPanelTitle}>
          <span>{genre.emoji}</span> {categoryLabel(t, { id: `live-${genre.slug}`, name: genre.name })}
        </span>
      </div>
      <div className={styles.songPanel}>
        {visible.map((song, i) => (
          <SongRow
            key={song.key}
            song={song}
            number={song.rank ?? i + 1}
            isNew={song.isNew}
            climb={song.climb}
            onSelect={() => onSelect(song)}
          />
        ))}
        {!expanded && genre.songs.length > visible.length && (
          <button className={styles.showMoreBtn} onClick={() => setExpanded(true)}>
            {t('search.showAll', { count: genre.songs.length })}
          </button>
        )}
      </div>
      <p className={rowStyles.source}>{source}</p>
    </>
  );
};

export default GenreShelfList;
