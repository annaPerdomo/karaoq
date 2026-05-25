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
  const [confirmSong, setConfirmSong] = React.useState<YoutubeResult | null>(null);
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });

  React.useEffect(() => {
    const savedMode = localStorage.getItem('karaoq_karaoke_mode');
    if (savedMode !== null) setKaraokeMode(savedMode === 'true');
  }, []);

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    localStorage.setItem('karaoq_karaoke_mode', String(next));
  }

  async function search(overrideFilters?: SearchFilters) {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);
    const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query.trim();
    try {
      const res = await searchYoutube(searchQuery, overrideFilters ?? filters);
      setResults(res);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  function updateFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && query.trim()) {
      setSearching(true);
      const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query.trim();
      searchYoutube(searchQuery, next)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }
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

    const ok = await postEntryToQueue(roomId, entry);
    if (ok) {
      onSongAdded(entry);
      setResults([]);
      setQuery('');
      setHasSearched(false);
      setConfirmSong(null);
      setJustAdded(entry.songTitle);
      setTimeout(() => setJustAdded(null), 3000);
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
        <button
          className={styles.searchBtn}
          onClick={() => search()}
          disabled={searching || !query.trim()}
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>

      <div className={styles.options}>
        <label className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Auto-add &ldquo;karaoke&rdquo;</span>
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

      {!hasSearched && results.length === 0 && !justAdded && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>&#127908;</div>
          <p>Search for a song to get started</p>
        </div>
      )}

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
