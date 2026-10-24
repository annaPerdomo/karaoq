import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import {
  SongCategory,
  SongSection,
  SongSuggestion,
} from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';
import { labelWithFallback } from './labelWithFallback';
import { buildDiscoveryData } from './discoveryData';
import CategoryGrid from './CategoryGrid';
import CategorySongList from './CategorySongList';
import LanguagePicker from './LanguagePicker';
import IdeaShelves from './IdeaShelves';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';

interface DiscoveryBrowserProps {
  orderedSections: SongSection[];
  langPacks: SongSection[];
  regionalSection: SongSection | null;
  shelves: IdeaShelf[];
  onShelfPick: (song: ShelfSong, shelf: IdeaShelf) => void;
  activeTab: string;
  onTabSelect: (tabId: string) => void;
  activeCategory: string | null;
  /** `sectionId` is only present when the caller wants a genre_chip funnel
   * event fired for this pick (see SongSearch's trackSuggestion wiring). */
  onCategorySelect: (category: SongCategory, sectionId?: string) => void;
  onCategoryBack: () => void;
  expandedCategory: boolean;
  onExpandCategory: () => void;
  selectedLang: string | null;
  onSelectedLangChange: (langId: string) => void;
  onSongSelect: (
    song: SongSuggestion,
    sectionId: string,
    categoryId: string,
    source: 'song_pick'
  ) => void;
  onSurpriseMe: () => void;
  /**
   * Rendered at the top of the scrollable browse area (above the "Song ideas"
   * tabs) while the user isn't looking at search results — home of the
   * "Sing with me" and Suggestions boards on the singer page.
   */
  belowSearch?: React.ReactNode;
}

const DiscoveryBrowser: React.FC<DiscoveryBrowserProps> = ({
  orderedSections,
  langPacks,
  regionalSection,
  shelves,
  onShelfPick,
  activeTab,
  onTabSelect,
  activeCategory,
  onCategorySelect,
  onCategoryBack,
  expandedCategory,
  onExpandCategory,
  selectedLang,
  onSelectedLangChange,
  onSongSelect,
  onSurpriseMe,
  belowSearch,
}) => {
  const { t } = useT();

  const {
    TAB_DEFS,
    langSections,
    isLangTab,
    currentSection,
    currentLang,
    allVisibleCats,
    expandedData,
    parentSection,
    songs,
    visible,
    hasMore,
  } = buildDiscoveryData({
    orderedSections,
    langPacks,
    regionalSection,
    activeTab,
    activeCategory,
    expandedCategory,
    selectedLang,
    languageTabLabel: t('search.tab.language'),
  });

  return (
    <div className={styles.discovery}>
      {/* Rendered inside the scroll container so the room board and the
          idea tabs scroll together instead of the board pinning itself
          above a separately-scrolling ideas list. */}
      {!expandedData && belowSearch}
      {!expandedData && (
        <div className={styles.discoveryHeading}>
          <span className={styles.discoveryTitle}>{t('search.ideas.title')}</span>
          <span className={styles.discoverySub}>
            {t('search.ideas.sub')}
          </span>
        </div>
      )}
      {!expandedData && <IdeaShelves shelves={shelves} onSelect={onShelfPick} />}
      {expandedData ? (
        <CategorySongList
          category={expandedData}
          songs={songs}
          visible={visible}
          hasMore={hasMore}
          expanded={expandedCategory}
          onBack={onCategoryBack}
          onExpand={onExpandCategory}
          onSongSelect={(song) =>
            onSongSelect(
              song,
              parentSection?.id ?? activeTab,
              activeCategory as string,
              'song_pick'
            )
          }
        />
      ) : (
        <>
          <div className={styles.tabBar}>
            {TAB_DEFS.map((s) => (
              <button
                key={s.id}
                className={`${styles.tabBtn} ${activeTab === s.id ? styles.tabBtnActive : ''}`}
                onClick={() => onTabSelect(s.id)}
              >
                {s.id === 'language' ? s.label : labelWithFallback(t, `section.${s.id}`, s.label)}
              </button>
            ))}
          </div>

          {isLangTab ? (
            <>
              <LanguagePicker
                langSections={langSections}
                currentLangId={currentLang?.id}
                onChange={onSelectedLangChange}
              />
              <CategoryGrid
                categories={currentLang?.categories ?? []}
                onSelect={(cat) => onCategorySelect(cat, currentLang!.id)}
              />
            </>
          ) : (
            <CategoryGrid
              categories={allVisibleCats}
              onSelect={(cat) => onCategorySelect(cat, currentSection?.id)}
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
