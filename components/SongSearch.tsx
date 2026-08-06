import * as React from 'react';

import styles from '../styles/SongSearch.module.css';
import { YoutubeResult } from '../app/queue/searchYoutube';
import { QueueEntry } from '../pages/api/types';
import useCountry from '../app/queue/useCountry';
import SearchResults from './search/SearchResults';
import { useT } from '../lib/i18n/I18nProvider';
import { INITIAL_RESULTS } from './songsearch/constants';
import SearchBar from './songsearch/SearchBar';
import SearchOptions from './songsearch/SearchOptions';
import DiscoveryBrowser from './songsearch/DiscoveryBrowser';
import ConfirmModal from './songsearch/ConfirmModal';
import { useSongSearchState } from './songsearch/hooks/useSongSearchState';
import { useDiscoveryBrowse } from './songsearch/hooks/useDiscoveryBrowse';
import { useSongAddFlow } from './songsearch/hooks/useSongAddFlow';

interface SongSearchProps {
  roomId: string;
  userName: string;
  onSongAdded: (entry: QueueEntry) => void;
  /** Show advanced filters (duration, sort). Defaults to true. */
  showFilters?: boolean;
  /** Show the name input field. Defaults to false. */
  showNameInput?: boolean;
  onNameChange?: (name: string) => void;
  /** Whether song add requires a non-empty userName. Defaults to true. */
  requireName?: boolean;
  /** Who is searching — recorded with the search_performed funnel event. */
  role?: "host" | "singer" | "display";
  /**
   * When provided, the component acts as a song *picker* instead of adding to
   * the queue: the "+" button returns the chosen result to the caller (used by
   * the "Sing with me" and Suggestions boards) and no name is required.
   */
  onPick?: (song: YoutubeResult) => void;
  /**
   * Rendered at the top of the scrollable browse area (above the "Song ideas"
   * tabs) while the user isn't looking at search results — home of the
   * "Sing with me" and Suggestions boards on the singer page.
   */
  belowSearch?: React.ReactNode;
}

const SongSearch: React.FC<SongSearchProps> = ({
  roomId,
  userName,
  onSongAdded,
  showFilters = true,
  showNameInput = false,
  onNameChange,
  requireName = true,
  role,
  onPick,
  belowSearch,
}) => {
  const country = useCountry();
  const { t } = useT();

  const {
    query,
    setQuery,
    results,
    visibleCount,
    setVisibleCount,
    searching,
    hasSearched,
    searchError,
    karaokeMode,
    filters,
    runSearch,
    toggleKaraokeMode,
    search,
    clearSearch,
    resetSearch,
    updateFilter,
    trackFirstSearch,
  } = useSongSearchState({ roomId, role });

  const {
    orderedSections,
    activeTab,
    activeCategory,
    expandedCategory,
    regionalSection,
    langPacks,
    selectedLang,
    trendingCategory,
    searchSuggestion,
    handleSurpriseMe,
    handleTabSelect,
    handleCategorySelect,
    handleSelectedLangChange,
    handleCategoryBack,
    handleExpandCategory,
  } = useDiscoveryBrowse({
    country,
    roomId,
    t,
    filters,
    karaokeMode,
    setQuery,
    runSearch,
    trackFirstSearch,
  });

  const {
    justAdded,
    addError,
    adding,
    confirmSong,
    previewPlaying,
    canAdd,
    addSong,
    openConfirm,
    handlePick,
    closeConfirm,
    playPreview,
  } = useSongAddFlow({ roomId, userName, requireName, onSongAdded, onPick, resetSearch });

  const publicRole = role === 'display' ? undefined : role;

  return (
    <div className={styles.container}>
      {showNameInput && (
        <div className={styles.nameSection}>
          <label className={styles.nameLabel}>{t('common.yourName')}</label>
          <input
            className={styles.nameInput}
            placeholder={t('common.enterYourName')}
            value={userName}
            onChange={(e) => onNameChange?.(e.target.value)}
          />
        </div>
      )}

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSearch={() => search()}
        searching={searching}
        karaokeMode={karaokeMode}
      />

      <SearchOptions
        karaokeMode={karaokeMode}
        onToggleKaraoke={toggleKaraokeMode}
        showFilters={showFilters}
        filters={filters}
        onUpdateFilter={updateFilter}
      />

      {justAdded && (
        <div className={styles.toast}>
          {t('search.added', { title: justAdded })}
        </div>
      )}

      {addError && (
        <div className={styles.toastError}>
          {t('search.addFailed')}
        </div>
      )}

      {hasSearched && (
        <button className={styles.backToBrowse} onClick={clearSearch}>
          <span className={styles.backToBrowseArrow} aria-hidden="true">←</span>
          {t('search.backToIdeas')}
        </button>
      )}

      <SearchResults
        hasSearched={hasSearched}
        searching={searching}
        searchError={searchError}
        results={results}
        visibleCount={visibleCount}
        canAdd={canAdd}
        pickMode={!!onPick}
        onPreview={(song) => openConfirm(song, true)}
        onAdd={(song) => (onPick ? handlePick(song) : openConfirm(song, false))}
        onShowMore={() => setVisibleCount((c) => c + INITIAL_RESULTS)}
        roomId={roomId}
        role={publicRole}
      />

      {!hasSearched && results.length === 0 && !justAdded && (
        <DiscoveryBrowser
          orderedSections={orderedSections}
          langPacks={langPacks}
          regionalSection={regionalSection}
          trendingCategory={trendingCategory}
          activeTab={activeTab}
          onTabSelect={handleTabSelect}
          activeCategory={activeCategory}
          onCategorySelect={handleCategorySelect}
          onCategoryBack={handleCategoryBack}
          expandedCategory={expandedCategory}
          onExpandCategory={handleExpandCategory}
          selectedLang={selectedLang}
          onSelectedLangChange={handleSelectedLangChange}
          onSongSelect={searchSuggestion}
          onSurpriseMe={handleSurpriseMe}
          roomId={roomId}
          role={publicRole}
          belowSearch={belowSearch}
        />
      )}

      {confirmSong && (
        <ConfirmModal
          song={confirmSong}
          previewPlaying={previewPlaying}
          onPlayPreview={playPreview}
          pickMode={!!onPick}
          userName={userName}
          adding={adding}
          onConfirm={() => (onPick ? handlePick(confirmSong) : addSong(confirmSong))}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
};

export default SongSearch;
