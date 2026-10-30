import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import type { GenreShelf } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import CategoryGrid from './CategoryGrid';

interface LiveGenresProps {
  genres: GenreShelf[];
  onSelect: (genre: GenreShelf) => void;
}

const LiveGenres: React.FC<LiveGenresProps> = ({ genres, onSelect }) => {
  const { t } = useT();
  if (genres.length === 0) return null;
  const tiles = genres.map((g) => ({ id: `live-${g.slug}`, name: g.name, emoji: g.emoji, songs: [] }));

  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHead}>
        <h3 className={styles.shelfTitle}>
          <span aria-hidden="true">📈</span> {t('ideas.genres.title')}
        </h3>
        <span className={styles.shelfSub}>{t('ideas.genres.sub')}</span>
      </div>
      <CategoryGrid
        categories={tiles}
        onSelect={(tile) => {
          const genre = genres.find((g) => `live-${g.slug}` === tile.id);
          if (genre) onSelect(genre);
        }}
      />
    </section>
  );
};

export default LiveGenres;
