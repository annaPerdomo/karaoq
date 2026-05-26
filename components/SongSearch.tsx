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
  getRandomSuggestion,
  buildSongQuery,
  SongSuggestion,
  SongCategory,
} from '../app/queue/songSuggestions';

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
}

const SongSearch: React.FC<SongSearchProps> = ({
  roomId,
  userName,
  onSongAdded,
  showFilters = true,
  showNameInput = false,
  onNameChange,
  requireName = true,
}) => {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<YoutubeResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [confirmSong, setConfirmSong] = React.useState<YoutubeResult | null>(null);
  const [activeTab, setActiveTab] = React.useState(SONG_SECTIONS[0].id);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = React.useState(false);
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

  React.useEffect(() => {
    clearTimeout(debounceRef.current);

    if (query.trim().length < 3) {
      if (query.trim().length === 0 && hasSearched) {
        setHasSearched(false);
        setResults([]);
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setHasSearched(true);
      const q = karaokeModeRef.current ? `${query.trim()} karaoke` : query.trim();
      searchYoutube(q, filtersRef.current, controller.signal)
        .then(setResults)
        .catch((err) => {
          if (err?.name !== 'AbortError') setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  React.useEffect(() => {
    const savedMode = localStorage.getItem('karaoq_karaoke_mode');
    if (savedMode !== null) setKaraokeMode(savedMode === 'true');
  }, []);

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    localStorage.setItem('karaoq_karaoke_mode', String(next));
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

  function trackSuggestion(
    source: 'random' | 'song_pick' | 'genre_chip',
    extra?: { sectionId?: string; categoryId?: string; songTitle?: string; songArtist?: string }
  ) {
    fetch('/api/analytics/suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, suggestionSource: source, ...extra }),
    }).catch(() => {});
  }

  function searchSuggestion(song: SongSuggestion, sectionId?: string, categoryId?: string) {
    const q = buildSongQuery(song);
    setQuery(q);
    setActiveCategory(null);

    trackSuggestion('song_pick', {
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
    const suggestion = getRandomSuggestion();
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

  const canAdd = !requireName || userName.trim().length > 0;

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
        {query && (
          <button
            className={styles.clearBtn}
            onClick={() => { setQuery(''); setHasSearched(false); setResults([]); }}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
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

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((song) => (
            <div key={song.videoId} className={styles.resultCard}>
              <img
                src={song.thumbnailUrl}
                alt=""
                className={styles.resultThumb}
              />
              <div className={styles.resultInfo}>
                <span className={styles.resultTitle}>{song.title}</span>
              </div>
              <button
                className={styles.addBtn}
                onClick={() => setConfirmSong(song)}
                disabled={!canAdd}
                title={!canAdd ? 'Enter your name first' : 'Add to queue'}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      {!hasSearched && results.length === 0 && !justAdded && (() => {
        const LANG_IDS = ['spanish', 'kpop', 'japanese'];
        const TAB_DEFS = [
          ...SONG_SECTIONS.filter((s) => !LANG_IDS.includes(s.id)),
          { id: 'language', label: 'Language', categories: [] as SongCategory[] },
        ];
        const langSections = SONG_SECTIONS.filter((s) => LANG_IDS.includes(s.id));
        const isLangTab = activeTab === 'language';

        const currentSection = isLangTab
          ? null
          : SONG_SECTIONS.find((s) => s.id === activeTab) ?? SONG_SECTIONS[0];

        const allVisibleCats = isLangTab
          ? langSections.flatMap((s) => s.categories)
          : currentSection?.categories ?? [];

        const expandedData = ALL_CATEGORIES.find((c) => c.id === activeCategory);
        const parentSection = SONG_SECTIONS.find((s) =>
          s.categories.some((c) => c.id === activeCategory)
        );
        const songs = expandedData?.songs ?? [];
        const INITIAL_COUNT = 8;
        const visible = expandedCategory ? songs : songs.slice(0, INITIAL_COUNT);
        const hasMore = songs.length > INITIAL_COUNT;

        return (
          <div className={styles.discovery}>
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
                      onClick={() => searchSuggestion(song, parentSection?.id ?? activeTab, activeCategory!)}
                    >
                      <span className={styles.songNum}>{i + 1}</span>
                      <span className={styles.songRowTitle}>{song.title}</span>
                      <span className={styles.songRowArtist}>{song.artist}</span>
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
                      onClick={() => { setActiveTab(s.id); setActiveCategory(null); setExpandedCategory(false); }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {isLangTab ? (
                  <div className={styles.cardGrid}>
                    {langSections.map((lang) => (
                      <React.Fragment key={lang.id}>
                        <div className={styles.langGroupHeader}>
                          <span>{lang.label}</span>
                        </div>
                        {lang.categories.map((cat) => (
                          <button
                            key={cat.id}
                            className={styles.categoryCard}
                            onClick={() => {
                              setActiveCategory(cat.id);
                              setExpandedCategory(false);
                              trackSuggestion('genre_chip', { sectionId: lang.id, categoryId: cat.id });
                            }}
                          >
                            <span className={styles.categoryEmoji}>{cat.emoji}</span>
                            <span className={styles.categoryName}>{cat.name}</span>
                          </button>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
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
              </>
            )}
          </div>
        );
      })()}

      {/* Confirm modal */}
      {confirmSong && (
        <div className={styles.overlay} onClick={() => setConfirmSong(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add to queue?</h3>
            <img
              src={confirmSong.thumbnailUrl}
              alt=""
              className={styles.modalThumb}
            />
            <p className={styles.modalSong}>{confirmSong.title}</p>
            <p className={styles.modalAs}>
              Adding as <strong>{userName}</strong>
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnPrimary} onClick={() => addSong(confirmSong)}>
                Add Song
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
