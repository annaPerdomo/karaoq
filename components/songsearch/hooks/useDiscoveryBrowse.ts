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
import { SearchFilters } from '../../../app/queue/searchYoutube';
import { LANG_IDS } from '../constants';

interface UseDiscoveryBrowseArgs {
  country: string | null;
  roomId: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  filters: SearchFilters;
  karaokeMode: boolean;
  setQuery: (query: string) => void;
  runSearch: (rawQuery: string, activeFilters: SearchFilters, karaoke: boolean) => void;
  trackFirstSearch: () => void;
}

// Owns the "Song ideas" browse view: geo-ordered sections/tabs, lazy-loaded
// language packs, trending songs, and the category/song selection that feeds
// a pick back into the search box.
export function useDiscoveryBrowse({
  country,
  roomId,
  t,
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
  const [selectedLang, setSelectedLang] = React.useState<string | null>(null);
  const [trendingSongs, setTrendingSongs] = React.useState<SongSuggestion[]>([]);
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

  // Follow the country's preferred first tab until the user picks one.
  React.useEffect(() => {
    if (userPickedTabRef.current) return;
    const first = orderedSections[0];
    if (!first) return;
    setActiveTab(LANG_IDS.includes(first.id) ? 'language' : first.id);
  }, [orderedSections]);

  // Every language pack is available to everyone under the Language tab —
  // geo only decides which one gets promoted to its own first tab. Packs are
  // lazy-loaded (CDN-cached JSON) the first time the tab opens.
  React.useEffect(() => {
    if (activeTab !== 'language' || langPacks.length > 0) return;
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

  // "Trending on karaoq" — most-added songs from our own analytics.
  React.useEffect(() => {
    const controller = new AbortController();
    const qs = country ? `?c=${country}` : '';
    fetch(`/api/suggestions/trending${qs}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { items?: { title: string; artist: string }[] }) => {
        if (Array.isArray(data.items)) {
          setTrendingSongs(
            data.items.map((s) => ({ title: s.title, artist: s.artist ?? '' }))
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [country]);

  const trendingCategory: SongCategory | null =
    trendingSongs.length > 0
      ? {
          id: 'trending',
          name: t('category.trending'),
          emoji: '📈',
          songs: trendingSongs,
        }
      : null;

  function trackSuggestion(
    source: 'random' | 'song_pick' | 'genre_chip' | 'trending',
    extra?: { sectionId?: string; categoryId?: string; songTitle?: string; songArtist?: string }
  ) {
    fetch('/api/analytics/suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, suggestionSource: source, ...extra }),
    }).catch(() => {});
  }

  function searchSuggestion(
    song: SongSuggestion,
    sectionId?: string,
    categoryId?: string,
    source: 'song_pick' | 'trending' | 'random' = 'song_pick'
  ) {
    trackFirstSearch();
    const q = buildSongQuery(song);
    setQuery(q);
    setActiveCategory(null);

    trackSuggestion(source, {
      sectionId,
      categoryId,
      songTitle: song.title,
      songArtist: song.artist,
    });

    runSearch(q, filters, karaokeMode);
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

  function handleSelectedLangChange(langId: string) {
    setSelectedLang(langId);
    setActiveCategory(null);
    setExpandedCategory(false);
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
    selectedLang,
    trendingCategory,
    searchSuggestion,
    handleSurpriseMe,
    handleTabSelect,
    handleCategorySelect,
    handleSelectedLangChange,
    handleCategoryBack,
    handleExpandCategory,
  };
}
