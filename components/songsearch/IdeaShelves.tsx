import * as React from 'react';

import styles from '../../styles/IdeaShelves.module.css';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import ShelfCard from './ShelfCard';

interface IdeaShelvesProps {
  shelves: IdeaShelf[];
  onSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const SHELF_EMOJI: Record<IdeaShelf['id'], string> = { hot: '🔥', rooms: '🎤' };

const IdeaShelves: React.FC<IdeaShelvesProps> = ({ shelves, onSelect }) => {
  const { t, locale } = useT();
  if (shelves.length === 0) return null;

  return (
    <div className={styles.shelves}>
      {shelves.map((shelf) => {
        const country = shelf.country ? countryName(shelf.country, locale) : null;
        const title = country
          ? t(`ideas.${shelf.id}.title`, { country })
          : t(`ideas.${shelf.id}.titleWorld`);
        return (
          <section key={shelf.id} className={styles.shelf}>
            <div className={styles.head}>
              <h3 className={styles.heading}>
                <span aria-hidden="true">{SHELF_EMOJI[shelf.id]}</span> {title}
              </h3>
              <span className={styles.sub}>{t(`ideas.${shelf.id}.sub`)}</span>
            </div>
            <div className={styles.row}>
              {shelf.songs.map((song) => (
                <ShelfCard key={song.key} song={song} onSelect={(s) => onSelect(s, shelf)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default IdeaShelves;
