import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/SongSearch.module.css';
import searchYoutube, {
  YoutubeResult,
  SearchFilters,
  VideoDuration,
  SortOrder,
} from '../app/queue/searchYoutube';
import postEntryToQueue from '../app/queue/postEntryToQueue';
import { QueueEntry } from '../pages/api/types';
import {
  SONG_SECTIONS,
  ALL_CATEGORIES,
  COUNTRY_CONFIG,
  LANGUAGE_PACKS,
  orderSections,
  getRandomSuggestion,
  buildSongQuery,
  displaySongTitle,
  displaySongArtist,
  SongSuggestion,
  SongCategory,
  SongSection,
} from '../app/queue/songSuggestions';
import useCountry from '../app/queue/useCountry';
import fetchRegionalPack from '../app/queue/regionalPack';

const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 'any', label: 'Any length' },
  { value: 'short', label: 'Short (< 4 min)' },
  { value: 'medium', label: 'Medium (4–20 min)' },
  { value: 'long', label: 'Long (> 20 min)' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'viewCount', label: 'View count' },
  { value: 'date', label: 'Upload date' },
  { value: 'rating', label: 'Rating' },
];

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
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<YoutubeResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [confirmSong, setConfirmSong] = React.useState<YoutubeResult | null>(null);
  const [previewPlaying, setPreviewPlaying] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(SONG_SECTIONS[0].id);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = React.useState(false);
  const [regionalSection, setRegionalSection] = React.useState<SongSection | null>(null);
  const [langPacks, setLangPacks] = React.useState<SongSection[]>([]);
  const [selectedLang, setSelectedLang] = React.useState<string | null>(null);
  const [trendingSongs, setTrendingSongs] = React.useState<SongSuggestion[]>([]);
  const userPickedTabRef = React.useRef(false);
  const country = useCountry();

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
    const LANG_IDS = ['spanish', 'kpop', 'japanese'];
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
          name: 'Trending on KaraoQ',
          emoji: '📈',
          songs: trendingSongs,
        }
      : null;
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
  const abortRef = React.useRef<AbortController>();
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;
  const karaokeModeRef = React.useRef(karaokeMode);
  karaokeModeRef.current = karaokeMode;

  // Clear results when query is emptied
  React.useEffect(() => {
    if (query.trim().length === 0 && hasSearched) {
      setHasSearched(false);
      setResults([]);
    }
  }, [query, hasSearched]);

  React.useEffect(() => {
    try {
      const savedMode = localStorage.getItem('karaoq_karaoke_mode');
      if (savedMode !== null) setKaraokeMode(savedMode === 'true');
    } catch {}
  }, []);

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    try {
      localStorage.setItem('karaoq_karaoke_mode', String(next));
    } catch {}
    if (hasSearched && query.trim()) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      const searchQuery = next ? `${query.trim()} karaoke` : query.trim();
      searchYoutube(searchQuery, filters, controller.signal)
        .then(setResults)
        .catch((err) => {
          if (err?.name !== 'AbortError') setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }
  }

  async function search(overrideFilters?: SearchFilters) {
    if (!query.trim()) return;
    trackFirstSearch();
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query.trim();
    try {
      const res = await searchYoutube(searchQuery, overrideFilters ?? filters, controller.signal);
      setResults(res);
    } catch (err: any) {
      if (err?.name !== 'AbortError') setResults([]);
    }
    if (!controller.signal.aborted) setSearching(false);
  }

  // Return from search results to the browse view (song ideas + room boards).
  function clearSearch() {
    abortRef.current?.abort();
    clearTimeout(debounceRef.current);
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setSearching(false);
  }

  function updateFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && query.trim()) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query.trim();
      searchYoutube(searchQuery, next, controller.signal)
        .then(setResults)
        .catch((err) => {
          if (err?.name !== 'AbortError') setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
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
    source: 'song_pick' | 'trending' = 'song_pick'
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

    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    const searchQuery = karaokeMode ? `${q} karaoke` : q;
    searchYoutube(searchQuery, filters, controller.signal)
      .then(setResults)
      .catch((err) => {
        if (err?.name !== 'AbortError') setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }

  function handleSurpriseMe() {
    const suggestion = getRandomSuggestion(
      orderedSections.flatMap((s) => s.categories)
    );
    trackSuggestion('random', { songTitle: suggestion.title, songArtist: suggestion.artist });
    searchSuggestion(suggestion);
  }

  async function addSong(song: YoutubeResult) {
    if (!roomId) return;
    if (requireName && !userName.trim()) return;

    const entry: QueueEntry = {
      id: uuidv4(),
      userName: userName.trim(),
      songTitle: song.title,
      videoId: song.videoId,
    };

    let ok = false;
    try {
      ok = await postEntryToQueue(roomId, entry);
    } catch {
      ok = false;
    }
    if (ok) {
      onSongAdded(entry);
      setResults([]);
      setQuery('');
      setHasSearched(false);
      setConfirmSong(null);
      setAddError(null);
      setJustAdded(entry.songTitle);
      setTimeout(() => setJustAdded(null), 3000);
    } else {
      setConfirmSong(null);
      setAddError(song.title);
      setTimeout(() => setAddError(null), 4000);
    }
  }

  // Open the preview/confirm modal for a search result. `autoplay` starts the
  // video straight away (when the user tapped the thumbnail to preview) vs.
  // showing the thumbnail first (when they tapped "+").
  function openConfirm(song: YoutubeResult, autoplay: boolean) {
    setPreviewPlaying(autoplay);
    setConfirmSong(song);
  }

  // In picker mode, hand the chosen song back to the caller and reset search.
  function handlePick(song: YoutubeResult) {
    onPick?.(song);
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setConfirmSong(null);
  }

  const canAdd = !!onPick || !requireName || userName.trim().length > 0;

  return (
    <div className={styles.container}>
      {showNameInput && (
        <div className={styles.nameSection}>
          <label className={styles.nameLabel}>Your name</label>
          <input
            className={styles.nameInput}
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => onNameChange?.(e.target.value)}
          />
        </div>
      )}

      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={karaokeMode ? 'Search for a song...' : 'Search YouTube...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button
          className={styles.searchBtn}
          onClick={() => search()}
          disabled={!query.trim() || searching}
        >
          Search
        </button>
        {/* Slim branded progress bar — absolutely positioned so it signals an
            in-flight search (including filter-change refreshes that keep the
            current results on screen) without nudging the layout. */}
        {searching && <span className={styles.searchProgress} aria-hidden="true" />}
      </div>

      <div className={styles.options}>
        <label className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Auto-add &ldquo;karaoke&rdquo; to search term</span>
          <button
            type="button"
            role="switch"
            aria-checked={karaokeMode}
            className={`${styles.toggle} ${karaokeMode ? styles.toggleOn : ''}`}
            onClick={toggleKaraokeMode}
          >
            <span className={styles.toggleKnob} />
          </button>
        </label>

        {showFilters && (
          <div className={styles.filterSection}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Duration</span>
              <div className={styles.filterChips}>
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.duration === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('duration', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Sort by</span>
              <div className={styles.filterChips}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.sortBy === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('sortBy', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {justAdded && (
        <div className={styles.toast}>
          Added &ldquo;{justAdded}&rdquo; to the queue!
        </div>
      )}

      {addError && (
        <div className={styles.toastError}>
          Failed to add song. Check your connection and try again.
        </div>
      )}

      {hasSearched && (
        <button className={styles.backToBrowse} onClick={clearSearch}>
          <span className={styles.backToBrowseArrow} aria-hidden="true">←</span>
          Back to song ideas
        </button>
      )}

      {hasSearched && !searching && results.length === 0 && (
        <div className={styles.noResults}>
          No songs found. Try a different search.
        </div>
      )}

      {/* Branded loading state for a fresh search: an animated equalizer plus
          skeleton cards shaped exactly like real result rows, so the results
          area holds its height and doesn't jump when songs arrive. */}
      {searching && results.length === 0 && (
        <div className={styles.results} aria-live="polite" aria-busy="true">
          <div className={styles.loadingHeader}>
            <span className={styles.eq} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className={styles.loadingText}>Finding songs&hellip;</span>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} aria-hidden="true">
              <div className={styles.skeletonThumb} />
              <div className={styles.skeletonLines}>
                <div className={styles.skeletonLine} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              </div>
              <div className={styles.skeletonAdd} />
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((song) => (
            <div key={song.videoId} className={styles.resultCard}>
              <button
                type="button"
                className={styles.resultPreviewBtn}
                onClick={() => openConfirm(song, true)}
                aria-label="Preview this song"
                title="Preview this song"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnails; Next optimization adds cost/latency without benefit */}
                <img
                  src={song.thumbnailUrl}
                  alt=""
                  className={styles.resultThumb}
                />
                <span className={styles.resultPlayIcon}>▶</span>
              </button>
              <div className={styles.resultInfo}>
                <span className={styles.resultTitle}>{song.title}</span>
              </div>
              <button
                className={styles.addBtn}
                onClick={() => (onPick ? handlePick(song) : openConfirm(song, false))}
                disabled={!canAdd}
                title={
                  !canAdd
                    ? 'Enter your name first'
                    : onPick
                    ? 'Choose this song'
                    : 'Add to queue'
                }
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      {!hasSearched && results.length === 0 && !justAdded && (() => {
        const LANG_IDS = ['spanish', 'kpop', 'japanese'];
        const nonLangSections = orderedSections.filter((s) => !LANG_IDS.includes(s.id));
        const TAB_DEFS = [
          ...nonLangSections,
          { id: 'language', label: 'Language', categories: [] as SongCategory[] },
        ];
        const langSections = [
          ...orderedSections.filter((s) => LANG_IDS.includes(s.id)),
          // Skip the pack already promoted to its own tab for this country.
          ...langPacks.filter((p) => p.id !== regionalSection?.id),
        ];
        const isLangTab = activeTab === 'language';

        const currentSection = isLangTab
          ? null
          : nonLangSections.find((s) => s.id === activeTab) ?? nonLangSections[0];

        const firstTabId = nonLangSections[0]?.id;
        const baseCats = isLangTab
          ? langSections.flatMap((s) => s.categories)
          : currentSection?.categories ?? [];
        // Trending sits at the end of the first tab's grid.
        const allVisibleCats =
          trendingCategory && !isLangTab && currentSection?.id === firstTabId
            ? [...baseCats, trendingCategory]
            : baseCats;

        const allCategories = [
          ...(trendingCategory ? [trendingCategory] : []),
          ...(regionalSection?.categories ?? []),
          ...langPacks.flatMap((p) => p.categories),
          ...ALL_CATEGORIES,
        ];
        const expandedData = allCategories.find((c) => c.id === activeCategory);
        const parentSection = [...orderedSections, ...langPacks].find((s) =>
          s.categories.some((c) => c.id === activeCategory)
        );
        const songs = expandedData?.songs ?? [];
        const INITIAL_COUNT = 8;
        const visible = expandedCategory ? songs : songs.slice(0, INITIAL_COUNT);
        const hasMore = songs.length > INITIAL_COUNT;

        return (
          <div className={styles.discovery}>
            {/* Rendered inside the scroll container so the room board and the
                idea tabs scroll together instead of the board pinning itself
                above a separately-scrolling ideas list. */}
            {!expandedData && belowSearch}
            {!expandedData && (
              <div className={styles.discoveryHeading}>
                <span className={styles.discoveryTitle}>Song ideas</span>
                <span className={styles.discoverySub}>
                  Not sure what to sing? Tap any song to look it up.
                </span>
              </div>
            )}
            {expandedData ? (
              <>
                <div className={styles.songPanelHead}>
                  <button
                    className={styles.backBtn}
                    onClick={() => setActiveCategory(null)}
                  >
                    &larr;
                  </button>
                  <span className={styles.songPanelTitle}>
                    <span>{expandedData.emoji}</span> {expandedData.name}
                  </span>
                </div>
                <div className={styles.songPanel}>
                  {visible.map((song, i) => (
                    <button
                      key={`${song.artist}-${song.title}`}
                      className={`${styles.songRow} ${i % 2 === 1 ? styles.songRowAlt : ''}`}
                      onClick={() =>
                        searchSuggestion(
                          song,
                          parentSection?.id ?? activeTab,
                          activeCategory!,
                          activeCategory === 'trending' ? 'trending' : 'song_pick'
                        )
                      }
                    >
                      <span className={styles.songNum}>{i + 1}</span>
                      <span className={styles.songRowTitle}>{displaySongTitle(song)}</span>
                      <span className={styles.songRowArtist}>{displaySongArtist(song)}</span>
                    </button>
                  ))}
                  {hasMore && !expandedCategory && (
                    <button
                      className={styles.showMoreBtn}
                      onClick={() => setExpandedCategory(true)}
                    >
                      Show all {songs.length} songs
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.tabBar}>
                  {TAB_DEFS.map((s) => (
                    <button
                      key={s.id}
                      className={`${styles.tabBtn} ${activeTab === s.id ? styles.tabBtnActive : ''}`}
                      onClick={() => { userPickedTabRef.current = true; setActiveTab(s.id); setActiveCategory(null); setExpandedCategory(false); }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {isLangTab ? (() => {
                  const currentLang =
                    langSections.find((s) => s.id === selectedLang) ?? langSections[0];
                  return (
                    <>
                      <div className={styles.langPickerRow}>
                        <span className={styles.langPickerLabel}>Language</span>
                        <select
                          className={styles.langPicker}
                          value={currentLang?.id ?? ''}
                          onChange={(e) => {
                            setSelectedLang(e.target.value);
                            setActiveCategory(null);
                            setExpandedCategory(false);
                          }}
                        >
                          {langSections.map((lang) => (
                            <option key={lang.id} value={lang.id}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.cardGrid}>
                        {(currentLang?.categories ?? []).map((cat) => (
                          <button
                            key={cat.id}
                            className={styles.categoryCard}
                            onClick={() => {
                              setActiveCategory(cat.id);
                              setExpandedCategory(false);
                              trackSuggestion('genre_chip', { sectionId: currentLang!.id, categoryId: cat.id });
                            }}
                          >
                            <span className={styles.categoryEmoji}>{cat.emoji}</span>
                            <span className={styles.categoryName}>{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })() : (
                  <div className={styles.cardGrid}>
                    {allVisibleCats.map((cat) => (
                      <button
                        key={cat.id}
                        className={styles.categoryCard}
                        onClick={() => {
                          setActiveCategory(cat.id);
                          setExpandedCategory(false);
                          if (currentSection) {
                            trackSuggestion('genre_chip', { sectionId: currentSection.id, categoryId: cat.id });
                          }
                        }}
                      >
                        <span className={styles.categoryEmoji}>{cat.emoji}</span>
                        <span className={styles.categoryName}>{cat.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.randWrap}>
                  <span className={styles.randLabel}>Want some help deciding?</span>
                  <button className={styles.surpriseBtn} onClick={handleSurpriseMe}>
                    <span className={styles.surpriseIcon}>🎲</span>
                    Pick a random song for me
                  </button>
                </div>

                <div className={styles.inlineFooter}>
                  <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.inlineFooterLink}>
                    made with <span className={styles.inlineFooterHeart}>&#9829;</span> by variations on a string
                  </a>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Confirm modal */}
      {confirmSong && (
        <div className={styles.overlay} onClick={() => setConfirmSong(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{onPick ? 'Preview' : 'Add to queue?'}</h3>
            <div className={styles.previewWrap}>
              {previewPlaying ? (
                <iframe
                  className={styles.previewFrame}
                  src={`https://www.youtube.com/embed/${confirmSong.videoId}?autoplay=1&rel=0`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                <button
                  type="button"
                  className={styles.previewPlayBtn}
                  onClick={() => setPreviewPlaying(true)}
                  title="Preview this video"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
                  <img
                    src={confirmSong.thumbnailUrl}
                    alt=""
                    className={styles.modalThumb}
                  />
                  <span className={styles.previewPlayIcon}>▶</span>
                </button>
              )}
            </div>
            <p className={styles.modalSong}>{confirmSong.title}</p>
            {!onPick && (
              <p className={styles.modalAs}>
                Adding as <strong>{userName}</strong>
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => (onPick ? handlePick(confirmSong) : addSong(confirmSong))}
              >
                {onPick ? 'Choose this song' : 'Add Song'}
              </button>
              <button
                className={styles.btnGhost}
                onClick={() => setConfirmSong(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongSearch;
