import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import type { SongCategory, SongSection } from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';
import type { CategoryGroup } from './placeLists';
import CategoryGrid from './CategoryGrid';
import { displayName } from './ShelfSection';

interface CategoryGroupsProps {
  groups: CategoryGroup[];
  /** The place whose own lists the "local" group holds. */
  place: string;
  sections: SongSection[];
  onSelect: (category: SongCategory, sectionId: string) => void;
  afterLocal?: React.ReactNode;
}

/** The Genres and Voice tabs: the place's own lists, then (for the singer's
 *  own place) the international ones. */
const CategoryGroups: React.FC<CategoryGroupsProps> = ({
  groups,
  place,
  sections,
  onSelect,
  afterLocal,
}) => {
  const { t, locale } = useT();
  const sectionOf = (cat: SongCategory) =>
    sections.find((s) => s.categories.some((c) => c.id === cat.id))?.id ?? '';

  return (
    <div className={styles.shelves}>
      {groups.map((group, i) => (
        <React.Fragment key={group.heading ?? 'only'}>
          <section className={styles.shelf}>
            {group.heading && (
              <div className={styles.shelfHead}>
                <h3 className={styles.shelfTitle}>
                  {group.heading === 'local'
                    ? displayName(place, 'region', locale)
                    : t('ideas.place.international')}
                </h3>
              </div>
            )}
            <CategoryGrid
              categories={group.categories}
              onSelect={(cat) => onSelect(cat, sectionOf(cat))}
            />
          </section>
          {i === 0 && afterLocal}
        </React.Fragment>
      ))}
    </div>
  );
};

export default CategoryGroups;
