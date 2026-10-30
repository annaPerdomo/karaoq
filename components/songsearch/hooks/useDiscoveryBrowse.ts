import * as React from 'react';

import {
  SONG_SECTIONS,
  getRandomSuggestion,
  buildSongQuery,
  SongSuggestion,
  SongCategory,
  SongSection,
} from '../../../app/queue/songSuggestions';
import fetchRegionalPack from '../../../app/queue/regionalPack';
import fetchShelves from '../../../app/queue/fetchShelves';
import type { GenreShelf, IdeaShelf, ShelfSong } from '../../../lib/shelfTypes';
import type { IdeaOrigin, IdeaSurface } from '../../../lib/ideaSurface';
import { SearchFilters } from '../../../app/queue/searchYoutube';
import { HOT_TAB } from '../constants';
import { SECTION_PACK, placeLists, sectionIdForPlace } from '../placeLists';
import { useGenreShelves } from './useGenreShelves';
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

  const { place, places, atHome, placeShelves, placeLoading, pick } = usePlace(country, locale);
  const liveGenres = useGenreShelves(place);

  const placeSectionId = sectionIdForPlace(place);
  const [failedPacks, setFailedPacks] = React.useState<Record<string, true>>({});
  const packsInFlightRef = React.useRef<Record<string, true>>({});
  React.useEffect(() => {
    const packId = placeSectionId ? SECTION_PACK[placeSectionId] : undefined;
    if (!placeSectionId || !packId || failedPacks[placeSectionId]) return;
    if (packsInFlightRef.current[placeSectionId]) return;
    if (langPacks.some((p) => p.id === placeSectionId)) return;
    const sectionId = placeSectionId;
    packsInFlightRef.current[sectionId] = true;
    fetchRegionalPack(packId).then((section) => {
      delete packsInFlightRef.current[sectionId];
      if (section) {
        setLangPacks((held) => (held.some((p) => p.id === section.id) ? held : held.concat(section)));
      } else {
        setFailedPacks((held) => ({ ...held, [sectionId]: true }));
      }
    });
  }, [placeSectionId, langPacks, failedPacks]);

  const allSections = React.useMemo(() => SONG_SECTIONS.concat(langPacks), [langPacks]);
  // A place whose pack hasn't arrived would otherwise flash the core lists.
  const listsLoading =
    !!placeSectionId &&
    !!SECTION_PACK[placeSectionId] &&
    !failedPacks[placeSectionId] &&
    !allSections.some((s) => s.id === placeSectionId);
  const lists = React.useMemo(
    () => placeLists(place, atHome, allSections),
    [place, atHome, allSections]
  );

  function pickPlace(next: string) {
    const nextSection = sectionIdForPlace(next);
    if (nextSection && failedPacks[nextSection]) {
      setFailedPacks((held) => {
        const rest = { ...held };
        delete rest[nextSection];
        return rest;
      });
    }
    pick(next);
    setActiveCategory(null);
    setExpandedCategory(false);
  }

  React.useEffect(() => {
    const controller = new AbortController();
    setShelvesLoading(true);
    fetchShelves(country, locale, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      setShelves(loaded ?? []);
      setShelvesLoading(false);
    });
    return () => controller.abort();
  }, [country, locale]);

  const [ideaOrigin, setIdeaOrigin] = React.useState<IdeaOrigin | null>(null);

  function surfaceOf(categoryId?: string): IdeaSurface {
    const category = allSections
      .flatMap((s) => s.categories)
      .find((c) => c.id === categoryId);
    return category?.voice ? 'voice' : 'genre';
  }

  function trackSuggestion(
    source: 'random' | 'song_pick' | 'genre_chip' | 'shelf',
    surface: IdeaSurface,
    extra?: { sectionId?: string; categoryId?: string; songTitle?: string; songArtist?: string }
  ) {
    fetch('/api/analytics/suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        suggestionSource: source,
        ideaSurface: surface,
        ideaAway: !atHome,
        ...extra,
      }),
    }).catch(() => {});
  }

  // Every idea is a corpus song, so the search serves its cuts. A shelf song
  // passes its key: the corpus _id, not necessarily what its name re-keys to.
  function showSongCuts(song: SongSuggestion, songKey?: string) {
    trackFirstSearch();
    const q = buildSongQuery(song);
    setQuery(q);
    setActiveCategory(null);
    liveGenres.close();
    runSearch(q, filters, karaokeMode, songKey ?? true);
  }

  function searchSuggestion(
    song: SongSuggestion,
    sectionId?: string,
    categoryId?: string,
    source: 'song_pick' | 'random' = 'song_pick'
  ) {
    const surface = source === 'random' ? 'random' : surfaceOf(categoryId);
    setIdeaOrigin({ surface, away: !atHome });
    trackSuggestion(source, surface, {
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
    setIdeaOrigin({ surface: shelf.id, away: !atHome });
    trackSuggestion('shelf', shelf.id, {
      sectionId: shelf.id,
      categoryId: shelf.country ?? shelf.language ?? 'world',
      songTitle: song.title,
      songArtist: song.artist,
    });
  }

  function handleGenreOpen(genre: GenreShelf) {
    liveGenres.open(genre.slug);
    trackSuggestion('genre_chip', 'genre_chart', {
      sectionId: 'live-genre',
      categoryId: `${genre.country}:${genre.slug}`,
    });
  }

  function trackGenrePick(song: ShelfSong, genre: GenreShelf) {
    trackFirstSearch();
    setIdeaOrigin({ surface: 'genre_chart', away: !atHome });
    trackSuggestion('shelf', 'genre_chart', {
      sectionId: 'live-genre',
      categoryId: `${genre.country}:${genre.slug}`,
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
    liveGenres.close();
    setActiveCategory(null);
    setExpandedCategory(false);
  }

  function handleCategorySelect(category: SongCategory, sectionId?: string) {
    setActiveCategory(category.id);
    setExpandedCategory(false);
    if (sectionId) {
      trackSuggestion('genre_chip', category.voice ? 'voice' : 'genre', {
        sectionId,
        categoryId: category.id,
      });
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
    placeShelves,
    placeLoading,
    pickPlace,
    ideaOrigin,
    shelves,
    shelvesLoading,
    listsLoading,
    searchSuggestion,
    showSongCuts,
    trackShelfPick,
    liveGenres: liveGenres.genres,
    openGenre: liveGenres.openGenre,
    handleGenreOpen,
    handleGenreBack: liveGenres.close,
    trackGenrePick,
    handleSurpriseMe,
    handleTabSelect,
    handleCategorySelect,
    handleCategoryBack,
    handleExpandCategory,
  };
}
