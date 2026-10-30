import * as React from 'react';

import {
  SONG_SECTIONS,
  LANGUAGE_PACKS,
  getRandomSuggestion,
  buildSongQuery,
  SongSuggestion,
  SongCategory,
  SongSection,
} from '../../../app/queue/songSuggestions';
import fetchRegionalPack from '../../../app/queue/regionalPack';
import fetchShelves from '../../../app/queue/fetchShelves';
import type { IdeaShelf, ShelfSong } from '../../../lib/shelfTypes';
import { SearchFilters } from '../../../app/queue/searchYoutube';
import { HOT_TAB } from '../constants';
import { BUNDLED_SECTIONS, placeLists, sectionIdForPlace } from '../placeLists';
import { usePlace } from './usePlace';

interface UseDiscoveryBrowseArgs {
  country: string | null;
  /** The UI language, so the shelves can follow a language the singer chose. */
  locale: string;
  roomId: string;
  filters: SearchFilters;
  karaokeMode: boolean;
  setQuery: (query: string) => void;
  runSearch: (
    rawQuery: string,
    activeFilters: SearchFilters,
    karaoke: boolean,
    fromSuggestion?: boolean | string
  ) => void;
  trackFirstSearch: () => void;
}

// Owns the "Song ideas" browse view: the place every tab follows, lazy-loaded
// language packs, the hot/rooms shelves, and the category/song selection that
// feeds a pick back into the search box.
export function useDiscoveryBrowse({
  country,
  locale,
  roomId,
  filters,
  karaokeMode,
  setQuery,
  runSearch,
  trackFirstSearch,
}: UseDiscoveryBrowseArgs) {
  const [activeTab, setActiveTab] = React.useState(HOT_TAB);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = React.useState(false);
  const [langPacks, setLangPacks] = React.useState<SongSection[]>([]);
  const [shelves, setShelves] = React.useState<IdeaShelf[]>([]);
  const [shelvesLoading, setShelvesLoading] = React.useState(true);

  const { place, places, atHome, chart, chartLoading, pick } = usePlace(country);

  // Language packs are CDN-cached JSON, fetched the first time a place needs
  // one; the bundled sections need nothing.
  const packsRequestedRef = React.useRef(false);
  const placeSectionId = sectionIdForPlace(place);
  React.useEffect(() => {
    if (!placeSectionId || BUNDLED_SECTIONS.indexOf(placeSectionId) >= 0) return;
    if (packsRequestedRef.current) return;
    packsRequestedRef.current = true;
    Promise.all(LANGUAGE_PACKS.map((p) => fetchRegionalPack(p.packId))).then((sections) => {
      const loaded = sections.filter((s): s is SongSection => Boolean(s));
      if (loaded.length > 0) setLangPacks(loaded);
      else packsRequestedRef.current = false;
    });
  }, [placeSectionId]);

  const allSections = React.useMemo(() => SONG_SECTIONS.concat(langPacks), [langPacks]);
  // A place whose pack hasn't arrived would otherwise flash the core lists.
  const listsLoading =
    !!placeSectionId &&
    BUNDLED_SECTIONS.indexOf(placeSectionId) < 0 &&
    !allSections.some((s) => s.id === placeSectionId);
  const lists = React.useMemo(
    () => placeLists(place, atHome, allSections),
    [place, atHome, allSections]
  );

  function pickPlace(next: string) {
    pick(next);
    setActiveCategory(null);
    setExpandedCategory(false);
  }

  React.useEffect(() => {
    const controller = new AbortController();
    setShelvesLoading(true);
    fetchShelves(country, locale, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      setShelves(loaded);
      setShelvesLoading(false);
    });
    return () => controller.abort();
  }, [country, locale]);

  function trackSuggestion(
    source: 'random' | 'song_pick' | 'genre_chip' | 'shelf',
    extra?: { sectionId?: string; categoryId?: string; songTitle?: string; songArtist?: string }
  ) {
    fetch('/api/analytics/suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, suggestionSource: source, ...extra }),
    }).catch(() => {});
  }

  // Every idea is a corpus song, so the search serves its cuts. A shelf song
  // passes its key: the corpus _id, not necessarily what its name re-keys to.
  function showSongCuts(song: SongSuggestion, songKey?: string) {
    trackFirstSearch();
    const q = buildSongQuery(song);
    setQuery(q);
    setActiveCategory(null);
    runSearch(q, filters, karaokeMode, songKey ?? true);
  }

  function searchSuggestion(
    song: SongSuggestion,
    sectionId?: string,
    categoryId?: string,
    source: 'song_pick' | 'random' = 'song_pick'
  ) {
    trackSuggestion(source, {
      sectionId,
      categoryId,
      songTitle: song.title,
      songArtist: song.artist,
    });
    showSongCuts(song);
  }

  /** A shelf tap's funnel event; the caller opens the song's versions with the
   *  shelf's own key (showSongCuts). */
  function trackShelfPick(song: ShelfSong, shelf: IdeaShelf) {
    trackFirstSearch();
    trackSuggestion('shelf', {
      sectionId: shelf.id,
      categoryId: shelf.country ?? 'world',
      songTitle: song.title,
      songArtist: song.artist,
    });
  }

  function handleSurpriseMe() {
    // From the place's own lists, so a Japan pick surprises with Japanese songs.
    const suggestion = getRandomSuggestion(
      lists.genres.concat(lists.voice).flatMap((g) => g.categories)
    );
    // The source rides through searchSuggestion's own tracking — a separate
    // pre-track here double-counted every surprise pick as `song_pick` too.
    searchSuggestion(suggestion, undefined, undefined, 'random');
  }

  function handleTabSelect(tabId: string) {
    setActiveTab(tabId);
    setActiveCategory(null);
    setExpandedCategory(false);
  }

  function handleCategorySelect(category: SongCategory, sectionId?: string) {
    setActiveCategory(category.id);
    setExpandedCategory(false);
    if (sectionId) {
      trackSuggestion('genre_chip', { sectionId, categoryId: category.id });
    }
  }

  function handleCategoryBack() {
    setActiveCategory(null);
  }

  function handleExpandCategory() {
    setExpandedCategory(true);
  }

  return {
    activeTab,
    activeCategory,
    expandedCategory,
    allSections,
    lists,
    place,
    places,
    atHome,
    chart,
    chartLoading,
    pickPlace,
    shelves,
    shelvesLoading,
    listsLoading,
    searchSuggestion,
    showSongCuts,
    trackShelfPick,
    handleSurpriseMe,
    handleTabSelect,
    handleCategorySelect,
    handleCategoryBack,
    handleExpandCategory,
  };
}
