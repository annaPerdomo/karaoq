import * as React from 'react';

import searchYoutube, {
  YoutubeResult,
  SearchFilters,
  SearchUnavailableError,
  SearchFailure,
} from '../../../app/queue/searchYoutube';
import lookupVideo from '../../../app/queue/lookupVideo';
import suggestionCuts from '../../../app/queue/suggestionCuts';
import { classifySearchInput } from '../../../lib/videoLink';
import { buildSearchQuery, searchCacheKey } from '../../../lib/searchQuery';
import { INITIAL_RESULTS } from '../constants';

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

// How long a filter chip waits for the singer to settle before searching.
const FILTER_SETTLE_MS = 600;

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
  // These results came from a pasted link, so the box holds a URL: every
  // control that would re-search it must sit still, or we spend 101 units on
  // guaranteed-garbage results.
  const [lookupMode, setLookupMode] = React.useState(false);
  // Moves with the results, not with the box: lookupMode is set when a lookup
  // starts and cleared on any keystroke, so deriving via from it misattributes adds.
  const [resultsVia, setResultsVia] = React.useState<'search' | 'paste'>('search');
  // Moves with the results, like resultsVia: a later typed search must not
  // inherit the attribution.
  const [resultsSuggestionKey, setResultsSuggestionKey] = React.useState<string | null>(
    null
  );
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
  const abortRef = React.useRef<AbortController>();

  // Closing the sheet just after tapping a filter chip would otherwise still
  // fire the debounced search, spending one of the day's live searches.
  React.useEffect(() => () => clearTimeout(debounceRef.current), []);

  React.useEffect(() => {
    if (query.trim().length === 0 && hasSearched) {
      // Mirror clearSearch(): abort any in-flight search, or its late results
      // would land with hasSearched === false — stranding the singer with
      // neither "back to ideas" nor the browse view.
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setSearching(false);
      setHasSearched(false);
      setResults([]);
      setSearchError(null);
    }
  }, [query, hasSearched]);

  // Editing the box always ends lookup mode — the text hasn't been classified
  // yet. Safe against search(): setting the flag there doesn't touch `query`.
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
  function runSearch(
    rawQuery: string,
    activeFilters: SearchFilters,
    karaoke: boolean,
    // True when this came from "Song ideas" rather than the search box.
    fromSuggestion = false
  ) {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    // Shared with the server so one intent can't key two cache entries.
    const query = buildSearchQuery(rawQuery, karaoke);
    // Keyed as the server keys the catalog, so the two agree on which
    // suggestion this is without trusting the client to name it. Always the
    // karaoke form: the catalog holds only karaoke keys, toggle or not.
    const suggestionKey = fromSuggestion
      ? searchCacheKey(buildSearchQuery(rawQuery, true))
      : null;
    // Cuts are the unfiltered answer, so a "short" chip must not be served from
    // them. Mirrors isCatalogFilters (lib/suggestionCatalog).
    const resolvable =
      suggestionKey &&
      activeFilters.duration === 'any' &&
      activeFilters.sortBy === 'relevance';
    // Anything but an abort falls through to the search the tap has always been;
    // an aborted tap must not start one nobody is waiting for.
    const fetching = resolvable
      ? suggestionCuts(suggestionKey, controller.signal).catch((err) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) throw err;
          return searchYoutube(query, activeFilters, controller.signal, roomId);
        })
      : searchYoutube(query, activeFilters, controller.signal, roomId);
    fetching
      .then((res) => {
        setResults(res);
        setResultsVia('search');
        setResultsSuggestionKey(suggestionKey);
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
        setResultsVia('paste');
        setResultsSuggestionKey(null);
        setVisibleCount(INITIAL_RESULTS);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        // An 11-character *word* is likelier a real query than a typo'd id, so
        // a bare miss falls through to the search it would have been. A URL
        // that misses never does — searching a URL string is 101 wasted units.
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

  // A playlist, a channel, a Vimeo URL: never searched, and the input keeps its
  // text so the singer can fix the link.
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
    // A query already saying "karaoke" searches the same either way, so
    // re-running spends a request to redraw identical results. The preference
    // still applies to the next query.
    const raw = query.trim();
    if (
      hasSearched &&
      !lookupMode &&
      raw &&
      buildSearchQuery(raw, next) !== buildSearchQuery(raw, karaokeMode)
    ) {
      runSearch(raw, filters, next);
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
    // Tapping the chip that's already active changes nothing to search for.
    if (filters[key] === value) return;
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && !lookupMode && query.trim()) {
      // Each filter combination is its own cache key and so its own live
      // search: trying "short", then "medium", then "long" spends three of the
      // day's ~100. The spinner starts immediately, so chips still feel instant.
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setSearching(true);
      setSearchError(null);
      const raw = query.trim();
      debounceRef.current = setTimeout(
        () => runSearch(raw, next, karaokeMode),
        FILTER_SETTLE_MS
      );
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
    resultsVia,
    resultsSuggestionKey,
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
