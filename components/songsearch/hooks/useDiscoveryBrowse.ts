import * as React from 'react';

import {
  SONG_SECTIONS,
  COUNTRY_CONFIG,
  LANGUAGE_PACKS,
  orderSections,
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
import { HOT_TAB, LANG_IDS, WORLD_TAB } from '../constants';

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

// Owns the "Song ideas" browse view: geo-ordered sections/tabs, lazy-loaded
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
  const [activeTab, setActiveTab] = React.useState(SONG_SECTIONS[0].id);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = React.useState(false);
  const [regionalSection, setRegionalSection] = React.useState<SongSection | null>(null);
  const [langPacks, setLangPacks] = React.useState<SongSection[]>([]);
  const [shelves, setShelves] = React.useState<IdeaShelf[]>([]);
  const userPickedTabRef = React.useRef(false);

  // Localize the discovery sections: reorder by country and, where a curated
  // regional pack exists, splice it in as the first tab.
  const orderedSections = React.useMemo(() => {
    const ordered = orderSections(SONG_SECTIONS, country);
    return regionalSection ? [regionalSection, ...ordered] : ordered;
  }, [country, regionalSection]);

  React.useEffect(() => {
    const packId = country ? COUNTRY_CONFIG[country]?.regionalPack : undefined;
    if (!packId) return;
    let cancelled = false;
    fetchRegionalPack(packId).then((section) => {
      if (!cancelled && section) setRegionalSection(section);
    });
    return () => {
      cancelled = true;
    };
  }, [country]);

  // Open on the shelves when there are any, else the country's preferred first
  // tab — until the user picks one.
  React.useEffect(() => {
    if (userPickedTabRef.current) return;
    if (shelves.length > 0) {
      setActiveTab(HOT_TAB);
      return;
    }
    const first = orderedSections[0];
    if (!first) return;
    setActiveTab(LANG_IDS.includes(first.id) ? WORLD_TAB : first.id);
  }, [orderedSections, shelves.length]);

  // Every language pack is available to everyone under the World tab — geo
  // only decides which one gets promoted to its own first tab. Packs are
  // lazy-loaded (CDN-cached JSON) the first time the tab opens.
  React.useEffect(() => {
    if (activeTab !== WORLD_TAB || langPacks.length > 0) return;
    let cancelled = false;
    Promise.all(LANGUAGE_PACKS.map((p) => fetchRegionalPack(p.packId))).then(
      (sections) => {
        if (cancelled) return;
        const loaded = sections.filter((s): s is SongSection => Boolean(s));
        if (loaded.length > 0) setLangPacks(loaded);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeTab, langPacks.length]);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchShelves(country, locale, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setShelves(loaded);
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
    const suggestion = getRandomSuggestion(
      orderedSections.flatMap((s) => s.categories)
    );
    // The source rides through searchSuggestion's own tracking — a separate
    // pre-track here double-counted every surprise pick as `song_pick` too.
    searchSuggestion(suggestion, undefined, undefined, 'random');
  }

  function handleTabSelect(tabId: string) {
    userPickedTabRef.current = true;
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
    orderedSections,
    activeTab,
    activeCategory,
    expandedCategory,
    regionalSection,
    langPacks,
    shelves,
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
