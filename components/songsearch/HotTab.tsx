import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import IdeasLoading from './IdeasLoading';
import ShelfSection from './ShelfSection';

interface HotTabProps {
  /** The singer's own shelves (their country's chart and what rooms sing),
   *  or the picked place's chart when they're looking elsewhere. */
  shelves: IdeaShelf[];
  loading: boolean;
  onSongSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
}

const HotTab: React.FC<HotTabProps> = ({ shelves, loading, onSongSelect }) => {
  const { t } = useT();
  if (loading) return <IdeasLoading />;
  if (shelves.length === 0) {
    return <span className={styles.shelfSub}>{t('ideas.place.empty')}</span>;
  }
  return (
    <div className={styles.shelves}>
      {shelves.map((shelf) => (
        <ShelfSection
          key={`${shelf.id}:${shelf.scope}:${shelf.country ?? shelf.language ?? 'world'}`}
          shelf={shelf}
          onSelect={onSongSelect}
        />
      ))}
    </div>
  );
};

export default HotTab;
