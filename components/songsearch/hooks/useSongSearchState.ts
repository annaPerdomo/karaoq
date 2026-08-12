import * as React from 'react';

import searchYoutube, {
  YoutubeResult,
  SearchFilters,
  SearchUnavailableError,
  SearchFailure,
} from '../../../app/queue/searchYoutube';
import lookupVideo from '../../../app/queue/lookupVideo';
import { classifySearchInput } from '../../../lib/videoLink';
import { INITIAL_RESULTS } from '../constants';

/** A failed lookup, mapped to what the user should be told. 404 and 422 are
 * about the link they pasted; everything else is our backend. */
function lookupFailure(err: unknown): SearchFailure {
  if (err instanceof SearchUnavailableError) {
    if (err.status === 404) return { quota: false, source: 'lookup', link: 'not_found' };
    if (err.status === 422) {
      return { quota: false, source: 'lookup', link: 'not_embeddable' };
    }
    if (err.reason === 'quota') {
      return { quota: true, resetsAt: err.resetsAt, source: 'lookup' };
    }
  }
  return { quota: false, source: 'lookup' };
}

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
  // The current view came from a pasted link, not a text search. The query box
  // then holds a URL, so re-running it as a search would spend a full 101-unit
  // search on a garbage query — the filter and karaoke controls must sit still.
  const [lookupMode, setLookupMode] = React.useState(false);
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

  // Editing the box always ends lookup mode: whatever is in there now hasn't
  // been classified yet, so the next search() decides afresh. Setting the flag
  // inside search() doesn't touch `query`, so this can't undo it.
  React.useEffect(() => {
    setLookupMode(false);
  }, [query]);

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
            ? { quota: err.reason === 'quota', resetsAt: err.resetsAt, source: 'search' }
            : { quota: false, source: 'search' }
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }

  // The pasted-link counterpart of runSearch: one videos.list lookup, no
  // karaoke suffix and no filters — the singer already told us the exact video.
  function runLookup(videoId: string, from: 'url' | 'bare', rawQuery: string) {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setLookupMode(true);
    lookupVideo(videoId, 'paste', controller.signal, roomId)
      .then((result) => {
        setResults([result]);
        setVisibleCount(INITIAL_RESULTS);
      })
      .catch((err) => {
        // Same caveat as runSearch: an aborted body read surfaces as a
        // SearchUnavailableError, not an AbortError, so a superseded lookup
        // would stamp a stale failure onto the new result set.
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        // An 11-character *word* that isn't a video id is far likelier to be a
        // real query than a typo'd id, so a bare miss falls through to the
        // search it would have been. A URL that misses never does — searching
        // the URL string is guaranteed garbage at 101 units.
        if (
          from === 'bare' &&
          err instanceof SearchUnavailableError &&
          err.status === 404
        ) {
          setLookupMode(false);
          // Aborts this controller, so the finally below leaves `searching`
          // alone — runSearch owns it from here.
          runSearch(rawQuery, filters, karaokeMode);
          return;
        }
        setResults([]);
        setSearchError(lookupFailure(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }

  // A link we can tell isn't a single video before spending anything: a
  // playlist, a channel, a Vimeo URL. Never searched — the input keeps its text
  // so the singer can fix the link.
  function failLink(link: 'no_video' | 'not_youtube') {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setSearching(false);
    setHasSearched(true);
    setLookupMode(true);
    setResults([]);
    setSearchError({ quota: false, source: 'lookup', link });
  }

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    try {
      localStorage.setItem('karaoq_karaoke_mode', String(next));
    } catch {}
    if (hasSearched && !lookupMode && query.trim()) {
      runSearch(query.trim(), filters, next);
    }
  }

  function search(overrideFilters?: SearchFilters) {
    const raw = query.trim();
    if (!raw) return;
    // A pasted link is still "this room searched".
    trackFirstSearch();

    const input = classifySearchInput(raw);
    if (input.kind === 'video') {
      runLookup(input.id, input.from, raw);
      return;
    }
    if (input.kind === 'youtube-url' || input.kind === 'url') {
      failLink(input.kind === 'url' ? 'not_youtube' : 'no_video');
      return;
    }
    runSearch(raw, overrideFilters ?? filters, karaokeMode);
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
    setLookupMode(false);
  }

  // Same reset as clearSearch(), used after a song is successfully added or
  // picked — no in-flight request to abort there, so it's kept separate.
  function resetSearch() {
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setSearchError(null);
    setLookupMode(false);
  }

  function updateFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && !lookupMode && query.trim()) {
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
    lookupMode,
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
