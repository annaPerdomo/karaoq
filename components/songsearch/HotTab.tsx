import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import type { SongCategory, SongSection } from '../../app/queue/songSuggestions';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import { sectionFor, useHotPlace } from './hooks/useHotPlace';
import CategoryGrid from './CategoryGrid';
import PlacePicker from './PlacePicker';
import ShelfSection from './ShelfSection';

interface HotTabProps {
  /** The singer's own shelves: their country's chart and what rooms sing. */
  shelves: IdeaShelf[];
  /** The singer's country (useCountry); null while unknown. */
  home: string | null;
  /** Every language list, shown as its place's classics. */
  sections: SongSection[];
  /** Lists not yet loaded are fetched when the singer looks elsewhere. */
  onLeaveHome: () => void;
  onSongSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
  onCategorySelect: (category: SongCategory, sectionId: string) => void;
}

const HotTab: React.FC<HotTabProps> = ({
  shelves,
  home,
  sections,
  onLeaveHome,
  onSongSelect,
  onCategorySelect,
}) => {
  const { t } = useT();
  const { place, places, atHome, chart, loading, pick } = useHotPlace(home, onLeaveHome);
  const shown = atHome ? shelves : chart ? [chart] : [];
  const classics = place ? sectionFor(place, sections) : null;

  return (
    <div className={styles.shelves}>
      <PlacePicker places={places} value={place} onChange={pick} />
      {shown.map((shelf) => (
        <ShelfSection
          key={`${shelf.id}:${shelf.scope}:${shelf.country ?? shelf.language ?? 'world'}`}
          shelf={shelf}
          onSelect={onSongSelect}
        />
      ))}
      {classics && (
        <section className={styles.shelf}>
          <div className={styles.shelfHead}>
            <h3 className={styles.shelfTitle}>
              <span aria-hidden="true">💿</span> {t('ideas.world.classics')}
            </h3>
          </div>
          <CategoryGrid
            categories={classics.categories}
            onSelect={(cat) => onCategorySelect(cat, classics.id)}
          />
        </section>
      )}
      {!atHome && !loading && !chart && !classics && (
        <span className={styles.shelfSub}>{t('ideas.place.empty')}</span>
      )}
    </div>
  );
};

export default HotTab;
