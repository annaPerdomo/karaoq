import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SongCategory, SongSection, SongSuggestion } from '../../app/queue/songSuggestions';
import type { GenreShelf, IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import { buildDiscoveryData } from './discoveryData';
import CategoryGroups from './CategoryGroups';
import CategorySongList from './CategorySongList';
import GenreShelfList from './GenreShelfList';
import { HOT_TAB } from './constants';
import HotTab from './HotTab';
import IdeasLoading from './IdeasLoading';
import LiveGenres from './LiveGenres';
import PlacePicker from './PlacePicker';
import type { PlaceLists } from './placeLists';

/** Every tab follows the place: Hot shows its chart, the others its lists. */
const TABS: { id: string; labelKey: string }[] = [
  { id: HOT_TAB, labelKey: 'search.tab.hot' },
  { id: 'genre', labelKey: 'section.genre' },
  { id: 'voice-type', labelKey: 'section.voice-type' },
];

interface DiscoveryBrowserProps {
  allSections: SongSection[];
  lists: PlaceLists;
  /** The place every tab follows ("" = the singer's own, unknown place). */
  place: string;
  places: string[];
  /** The singer's country (useCountry). */
  home: string | null;
  atHome: boolean;
  /** The singer's own shelves; shown while they're at home. */
  shelves: IdeaShelf[];
  shelvesLoading: boolean;
  /** The place's Genre/Voice lists haven't arrived yet. */
  listsLoading: boolean;
  placeShelves: IdeaShelf[] | null;
  placeLoading: boolean;
  onPlaceChange: (place: string) => void;
  onShelfPick: (song: ShelfSong, shelf: IdeaShelf) => void;
  liveGenres: GenreShelf[];
  openGenre: GenreShelf | null;
  onGenreOpen: (genre: GenreShelf) => void;
  onGenreBack: () => void;
  onGenrePick: (song: ShelfSong, genre: GenreShelf) => void;
  activeTab: string;
  onTabSelect: (tabId: string) => void;
  activeCategory: string | null;
  /** `sectionId` is only present when the caller wants a genre_chip funnel
   * event fired for this pick (see SongSearch's trackSuggestion wiring). */
  onCategorySelect: (category: SongCategory, sectionId?: string) => void;
  onCategoryBack: () => void;
  expandedCategory: boolean;
  onExpandCategory: () => void;
  onSongSelect: (song: SongSuggestion, sectionId: string, categoryId: string) => void;
  onSurpriseMe: () => void;
  /**
   * Rendered at the top of the scrollable browse area (above the "Song ideas"
   * tabs) while the user isn't looking at search results — home of the
   * "Sing with me" and Suggestions boards on the singer page.
   */
  belowSearch?: React.ReactNode;
}

const DiscoveryBrowser: React.FC<DiscoveryBrowserProps> = ({
  allSections,
  lists,
  place,
  places,
  home,
  atHome,
  shelves,
  shelvesLoading,
  listsLoading,
  placeShelves,
  placeLoading,
  onPlaceChange,
  onShelfPick,
  liveGenres,
  openGenre,
  onGenreOpen,
  onGenreBack,
  onGenrePick,
  activeTab,
  onTabSelect,
  activeCategory,
  onCategorySelect,
  onCategoryBack,
  expandedCategory,
  onExpandCategory,
  onSongSelect,
  onSurpriseMe,
  belowSearch,
}) => {
  const { t } = useT();
  const { expandedData, parentSection, songs, visible, hasMore } = buildDiscoveryData({
    allSections,
    activeCategory,
    expandedCategory,
  });

  return (
    <div className={styles.discovery}>
      {/* Rendered inside the scroll container so the room board and the
          idea tabs scroll together instead of the board pinning itself
          above a separately-scrolling ideas list. */}
      {!expandedData && !openGenre && belowSearch}
      {openGenre ? (
        <GenreShelfList
          genre={openGenre}
          onBack={onGenreBack}
          onSelect={(song) => onGenrePick(song, openGenre)}
        />
      ) : expandedData ? (
        <CategorySongList
          category={expandedData}
          songs={songs}
          visible={visible}
          hasMore={hasMore}
          expanded={expandedCategory}
          onBack={onCategoryBack}
          onExpand={onExpandCategory}
          onSongSelect={(song) =>
            onSongSelect(song, parentSection?.id ?? activeTab, activeCategory as string)
          }
        />
      ) : (
        <>
          <PlacePicker
            places={places}
            value={place}
            home={home}
            onChange={onPlaceChange}
            title={<span className={styles.discoveryTitle}>{t('search.ideas.title')}</span>}
            sub={<span className={styles.discoverySub}>{t('search.ideas.sub')}</span>}
          />
          <div className={styles.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
                onClick={() => onTabSelect(tab.id)}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          {activeTab === HOT_TAB ? (
            <HotTab
              shelves={atHome ? shelves : placeShelves ?? []}
              loading={atHome ? shelvesLoading : placeLoading}
              onSongSelect={onShelfPick}
            />
          ) : listsLoading ? (
            <IdeasLoading />
          ) : (
            <CategoryGroups
              groups={activeTab === 'voice-type' ? lists.voice : lists.genres}
              place={place}
              sections={allSections}
              onSelect={(cat, sectionId) => onCategorySelect(cat, sectionId)}
              afterLocal={
                activeTab === 'genre' ? (
                  <LiveGenres genres={liveGenres} onSelect={onGenreOpen} />
                ) : undefined
              }
            />
          )}

          <div className={styles.randWrap}>
            <span className={styles.randLabel}>{t('search.help')}</span>
            <button className={styles.surpriseBtn} onClick={onSurpriseMe}>
              <span className={styles.surpriseIcon}>🎲</span>
              {t('search.surprise')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DiscoveryBrowser;
