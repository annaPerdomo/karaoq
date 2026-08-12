import * as React from 'react';

import searchYoutube, {
  YoutubeResult,
  SearchFilters,
  SearchUnavailableError,
  SearchFailure,
} from '../../../app/queue/searchYoutube';
import { INITIAL_RESULTS } from '../constants';

interface UseSongSearchStateArgs {
  roomId: string;
  role?: 'host' | 'singer' | 'display';
}

// Owns the YouTube search box: query/filters/karaoke-mode state, the debounced
// abort-and-refetch runner behind every search entry point, and the
// first-search funnel event.
export function useSongSearchState({ roomId, role }: UseSongSearchStateArgs) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<YoutubeResult[]>([]);
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_RESULTS);
  const [searching, setSearching] = React.useState(false);
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [hasSearched, setHasSearched] = React.useState(false);
  // null = search is fine. Set only on a backend failure (quota/outage/rate
  // limit) so a real zero-result search still reads as "no songs found".
  const [searchError, setSearchError] = React.useState<SearchFailure | null>(null);
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
  const abortRef = React.useRef<AbortController>();

  React.useEffect(() => {
    if (query.trim().length === 0 && hasSearched) {
      // Mirror clearSearch(): abort any in-flight search, or its late results
      // would land with hasSearched === false — stranding the singer with
      // neither "back to ideas" nor the browse view.
      abortRef.current?.abort();
      setSearching(false);
      setHasSearched(false);
      setResults([]);
      setSearchError(null);
    }
  }, [query, hasSearched]);

  React.useEffect(() => {
    try {
      const savedMode = localStorage.getItem('karaoq_karaoke_mode');
      if (savedMode !== null) setKaraokeMode(savedMode === 'true');
    } catch {}
  }, []);

  // Single runner behind every search entry point (typed search, filter
  // change, karaoke toggle, suggestion tap): abort the in-flight request and
  // reset the "Show more" window for the fresh result set.
  function runSearch(rawQuery: string, activeFilters: SearchFilters, karaoke: boolean) {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    const searchQuery = karaoke ? `${rawQuery} karaoke` : rawQuery;
    searchYoutube(searchQuery, activeFilters, controller.signal, roomId)
      .then((res) => {
        setResults(res);
        setVisibleCount(INITIAL_RESULTS);
      })
      .catch((err) => {
        // An aborted body read surfaces as a SearchUnavailableError, not an
        // AbortError, so a superseded search would stamp a stale failure onto
        // the new result set.
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setResults([]);
        // Every non-abort failure, including a bare fetch TypeError: a dropped
        // connection must not render as "your song isn't on YouTube".
        setSearchError(
          err instanceof SearchUnavailableError
            ? { quota: err.reason === 'quota', resetsAt: err.resetsAt }
            : { quota: false }
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    try {
      localStorage.setItem('karaoq_karaoke_mode', String(next));
    } catch {}
    if (hasSearched && query.trim()) {
      runSearch(query.trim(), filters, next);
    }
  }

  function search(overrideFilters?: SearchFilters) {
    if (!query.trim()) return;
    trackFirstSearch();
    runSearch(query.trim(), overrideFilters ?? filters, karaokeMode);
  }

  // Return from search results to the browse view (song ideas + room boards).
  function clearSearch() {
    abortRef.current?.abort();
    clearTimeout(debounceRef.current);
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setSearching(false);
    setSearchError(null);
  }

  // Same reset as clearSearch(), used after a song is successfully added or
  // picked — no in-flight request to abort there, so it's kept separate.
  function resetSearch() {
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setSearchError(null);
  }

  function updateFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && query.trim()) {
      runSearch(query.trim(), next, karaokeMode);
    }
  }

  // Fire a one-time funnel event the first time this room runs a search, so we
  // can tell "joined but never searched" apart from "searched but didn't add".
  const searchTrackedRef = React.useRef(false);
  function trackFirstSearch() {
    if (searchTrackedRef.current) return;
    searchTrackedRef.current = true;
    const payload = JSON.stringify({ roomId, role });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/search', payload);
    } else {
      fetch('/api/analytics/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  return {
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
  };
}
