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
import SearchResults from './search/SearchResults';
import fetchRegionalPack from '../app/queue/regionalPack';
import { useT } from '../lib/i18n/I18nProvider';
import { renderWithHeart } from '../lib/i18n/renderWithHeart';

const DURATION_OPTIONS: { value: VideoDuration; tKey: string }[] = [
  { value: 'any', tKey: 'search.duration.any' },
  { value: 'short', tKey: 'search.duration.short' },
  { value: 'medium', tKey: 'search.duration.medium' },
  { value: 'long', tKey: 'search.duration.long' },
];

// How many results are revealed at once; the server returns up to 25 per
// search (one YouTube quota spend) and "Show more" pages through the rest
// client-side without another request.
const INITIAL_RESULTS = 8;

const SORT_OPTIONS: { value: SortOrder; tKey: string }[] = [
  { value: 'relevance', tKey: 'search.sort.relevance' },
  { value: 'viewCount', tKey: 'search.sort.viewCount' },
  { value: 'date', tKey: 'search.sort.date' },
  { value: 'rating', tKey: 'search.sort.rating' },
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
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_RESULTS);
  const [searching, setSearching] = React.useState(false);
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  // In-flight guard: on a slow connection a double-tapped Add would $push
  // two fresh-uuid entries — the same song queued twice.
  const [adding, setAdding] = React.useState(false);
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
  const { t } = useT();
  // Translate a browse label by its data id, falling back to the curated
  // English name when a locale hasn't translated that section/category.
  const label = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t]
  );

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
          name: t('category.trending'),
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

  React.useEffect(() => {
    if (query.trim().length === 0 && hasSearched) {
      // Mirror clearSearch(): abort any in-flight search, or its late results
      // would land with hasSearched === false — stranding the singer with
      // neither "back to ideas" nor the browse view.
      abortRef.current?.abort();
      setSearching(false);
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
    const searchQuery = karaoke ? `${rawQuery} karaoke` : rawQuery;
    searchYoutube(searchQuery, activeFilters, controller.signal)
      .then((res) => {
        setResults(res);
        setVisibleCount(INITIAL_RESULTS);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setResults([]);
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

  async function addSong(song: YoutubeResult) {
    if (!roomId || adding) return;
    if (requireName && !userName.trim()) return;

    const entry: QueueEntry = {
      id: uuidv4(),
      userName: userName.trim(),
      songTitle: song.title,
      videoId: song.videoId,
    };

    setAdding(true);
    let ok = false;
    try {
      ok = await postEntryToQueue(roomId, entry);
    } catch {
      ok = false;
    } finally {
      setAdding(false);
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
          <label className={styles.nameLabel}>{t('common.yourName')}</label>
          <input
            className={styles.nameInput}
            placeholder={t('common.enterYourName')}
            value={userName}
            onChange={(e) => onNameChange?.(e.target.value)}
          />
        </div>
      )}

      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={karaokeMode ? t('search.placeholder.karaoke') : t('search.placeholder.youtube')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button
          className={styles.searchBtn}
          onClick={() => search()}
          disabled={!query.trim() || searching}
        >
          {t('search.button')}
        </button>
        {/* Slim branded progress bar — absolutely positioned so it signals an
            in-flight search (including filter-change refreshes that keep the
            current results on screen) without nudging the layout. */}
        {searching && <span className={styles.searchProgress} aria-hidden="true" />}
      </div>

      <div className={styles.options}>
        <label className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{t('search.autoAddKaraoke')}</span>
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
              <span className={styles.filterLabel}>{t('search.duration')}</span>
              <div className={styles.filterChips}>
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.duration === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('duration', opt.value)}
                  >
                    {t(opt.tKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t('search.sortBy')}</span>
              <div className={styles.filterChips}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.sortBy === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('sortBy', opt.value)}
                  >
                    {t(opt.tKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

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
        results={results}
        visibleCount={visibleCount}
        canAdd={canAdd}
        pickMode={!!onPick}
        onPreview={(song) => openConfirm(song, true)}
        onAdd={(song) => (onPick ? handlePick(song) : openConfirm(song, false))}
        onShowMore={() => setVisibleCount((c) => c + INITIAL_RESULTS)}
      />

      {!hasSearched && results.length === 0 && !justAdded && (() => {
        const LANG_IDS = ['spanish', 'kpop', 'japanese'];
        const nonLangSections = orderedSections.filter((s) => !LANG_IDS.includes(s.id));
        const TAB_DEFS = [
          ...nonLangSections,
          { id: 'language', label: t('search.tab.language'), categories: [] as SongCategory[] },
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
                <span className={styles.discoveryTitle}>{t('search.ideas.title')}</span>
                <span className={styles.discoverySub}>
                  {t('search.ideas.sub')}
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
                    <span>{expandedData.emoji}</span> {label(`category.${expandedData.id}`, expandedData.name)}
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
                      {t('search.showAll', { count: songs.length })}
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
                      {s.id === 'language' ? s.label : label(`section.${s.id}`, s.label)}
                    </button>
                  ))}
                </div>

                {isLangTab ? (() => {
                  const currentLang =
                    langSections.find((s) => s.id === selectedLang) ?? langSections[0];
                  return (
                    <>
                      <div className={styles.langPickerRow}>
                        <span className={styles.langPickerLabel}>{t('search.tab.language')}</span>
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
                            <span className={styles.categoryName}>{label(`category.${cat.id}`, cat.name)}</span>
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
                        <span className={styles.categoryName}>{label(`category.${cat.id}`, cat.name)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.randWrap}>
                  <span className={styles.randLabel}>{t('search.help')}</span>
                  <button className={styles.surpriseBtn} onClick={handleSurpriseMe}>
                    <span className={styles.surpriseIcon}>🎲</span>
                    {t('search.surprise')}
                  </button>
                </div>

                <div className={styles.inlineFooter}>
                  <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.inlineFooterLink}>
                    {renderWithHeart(t('footer.credit'), styles.inlineFooterHeart)}
                  </a>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {confirmSong && (
        <div className={styles.overlay} onClick={() => setConfirmSong(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{onPick ? t('search.confirm.preview') : t('search.confirm.addTitle')}</h3>
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
                  title={t('search.confirm.previewVideo')}
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
                {t('search.confirm.addingAs').split(/(\{name\})/).map((part, i) =>
                  part === '{name}' ? <strong key={i}>{userName}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
                )}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => (onPick ? handlePick(confirmSong) : addSong(confirmSong))}
                disabled={adding}
              >
                {onPick ? t('search.confirm.choose') : t('search.confirm.add')}
              </button>
              <button
                className={styles.btnGhost}
                onClick={() => setConfirmSong(null)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongSearch;
