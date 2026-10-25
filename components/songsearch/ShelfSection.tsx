import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import ssStyles from '../../styles/SongSearch.module.css';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import SongRow from './SongRow';
import { INITIAL_CATEGORY_SONGS } from './constants';

interface ShelfSectionProps {
  shelf: IdeaShelf;
  onSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
}

export function displayName(code: string, type: 'region' | 'language', locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Another country's chart reads exactly like the home one. */
function copyId(shelf: IdeaShelf): 'hot' | 'rooms' {
  return shelf.id === 'rooms' ? 'rooms' : 'hot';
}

const SHELF_EMOJI = { hot: '🔥', rooms: '🎤' };

function useShelfTitle(shelf: IdeaShelf): string {
  const { t, locale } = useT();
  const id = copyId(shelf);
  if (shelf.scope === 'country' && shelf.country) {
    return t(`ideas.${id}.title`, { country: displayName(shelf.country, 'region', locale) });
  }
  if (shelf.scope === 'language' && shelf.language) {
    return t(`ideas.${id}.titleLanguage`, {
      language: displayName(shelf.language, 'language', locale),
    });
  }
  return t(`ideas.${id}.titleWorld`);
}

const ShelfSection: React.FC<ShelfSectionProps> = ({ shelf, onSelect }) => {
  const { t } = useT();
  const title = useShelfTitle(shelf);
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? shelf.songs : shelf.songs.slice(0, INITIAL_CATEGORY_SONGS);

  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHead}>
        <h3 className={styles.shelfTitle}>
          <span aria-hidden="true">{SHELF_EMOJI[copyId(shelf)]}</span> {title}
        </h3>
        <span className={styles.shelfSub}>{t(`ideas.${copyId(shelf)}.sub`)}</span>
      </div>
      <div className={ssStyles.songPanel}>
        {visible.map((song, i) => (
          <SongRow
            key={song.key}
            song={song}
            number={song.rank ?? i + 1}
            isNew={song.isNew}
            climb={song.climb}
            rooms={song.rooms}
            onSelect={() => onSelect(song, shelf)}
          />
        ))}
        {!expanded && shelf.songs.length > visible.length && (
          <button className={ssStyles.showMoreBtn} onClick={() => setExpanded(true)}>
            {t('search.showAll', { count: shelf.songs.length })}
          </button>
        )}
      </div>
    </section>
  );
};

export default ShelfSection;
