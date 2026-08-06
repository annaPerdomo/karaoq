import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SongCategory } from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';
import { labelWithFallback } from './labelWithFallback';

interface CategoryGridProps {
  categories: SongCategory[];
  onSelect: (category: SongCategory) => void;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({ categories, onSelect }) => {
  const { t } = useT();

  return (
    <div className={styles.cardGrid}>
      {categories.map((cat) => (
        <button
          key={cat.id}
          className={styles.categoryCard}
          onClick={() => onSelect(cat)}
        >
          <span className={styles.categoryEmoji}>{cat.emoji}</span>
          <span className={styles.categoryName}>{labelWithFallback(t, `category.${cat.id}`, cat.name)}</span>
        </button>
      ))}
    </div>
  );
};

export default CategoryGrid;
