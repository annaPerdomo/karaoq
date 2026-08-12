import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { YoutubeResult, SearchFailure } from '../../app/queue/searchYoutube';
import { formatDuration } from '../../lib/duration';
import { useT } from '../../lib/i18n/I18nProvider';
import FeedbackTrigger from '../feedback/FeedbackTrigger';

interface SearchResultsProps {
  hasSearched: boolean;
  searching: boolean;
  /** Set when the last search failed backend-side (quota/rate-limit/outage) —
   * distinct from a real zero-result search, so we don't tell someone their
   * song doesn't exist when it's actually our server having a bad minute. */
  searchError: SearchFailure | null;
  results: YoutubeResult[];
  /** How many results are revealed; the rest sit behind "Show more". */
  visibleCount: number;
  canAdd: boolean;
  /** Picker mode ("Sing with me" / Suggestions boards) vs. add-to-queue. */
  pickMode: boolean;
  onPreview: (song: YoutubeResult) => void;
  onAdd: (song: YoutubeResult) => void;
  onShowMore: () => void;
  roomId?: string;
  role?: 'host' | 'singer';
}

const SKELETON_COUNT = 8;
// Pasted-link outcomes. These are about what the singer typed, not about our
// backend, so they replace the "we're popular right now" framing entirely.
const LINK_MESSAGE_KEYS: Record<NonNullable<SearchFailure['link']>, string> = {
  not_found: 'search.linkNotFound',
  not_embeddable: 'search.linkNotEmbeddable',
  no_video: 'search.linkNoVideo',
  not_youtube: 'search.linkNotYoutube',
};
// Stagger resets each "Show more" batch so newly revealed rows animate in
// from the top of the batch instead of waiting out the full list's delays.
const STAGGER_BATCH = 8;
const STAGGER_STEP_MS = 45;

const SearchResults: React.FC<SearchResultsProps> = ({
  hasSearched,
  searching,
  searchError,
  results,
  visibleCount,
  canAdd,
  pickMode,
  onPreview,
  onAdd,
  onShowMore,
  roomId,
  role,
}) => {
  const { t, locale } = useT();
  const compactViews = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [locale]
  );

  if (hasSearched && !searching && results.length === 0 && searchError) {
    // Round up so "58 minutes left" never reads as "0h".
    const hoursLeft = searchError.resetsAt
      ? Math.max(
          1,
          Math.ceil(
            (new Date(searchError.resetsAt).getTime() - Date.now()) / 3_600_000
          )
        )
      : null;
    const linkKey = searchError.link ? LINK_MESSAGE_KEYS[searchError.link] : null;
    // A link that didn't resolve is the singer's to fix, so it gets neither the
    // apology title nor the "tell us what happened" prompt.
    if (linkKey) {
      return (
        <div className={styles.unavailable}>
          <span className={styles.unavailableEmoji} aria-hidden="true">🔗</span>
          <p className={styles.unavailableBody}>{t(linkKey)}</p>
        </div>
      );
    }
    return (
      <div className={styles.unavailable}>
        <span className={styles.unavailableEmoji} aria-hidden="true">🎤</span>
        <p className={styles.unavailableTitle}>{t('search.unavailable.title')}</p>
        <p className={styles.unavailableBody}>
          {searchError.quota && hoursLeft
            ? t('search.unavailable.quotaBody', { hours: hoursLeft })
            : t('search.unavailable.body')}
        </p>
        {/* A spent quota still leaves the 1-unit lookups working for a while,
            so a *searcher* is told to paste a link. Someone whose paste just
            hit the same quota isn't — that would loop them. */}
        {searchError.quota && searchError.source !== 'lookup' && (
          <p className={styles.unavailableBody}>{t('search.quotaPasteHint')}</p>
        )}
        <FeedbackTrigger className={styles.unavailableFeedback} roomId={roomId} role={role}>
          {t('search.unavailable.feedback')}
        </FeedbackTrigger>
      </div>
    );
  }

  if (hasSearched && !searching && results.length === 0) {
    return <div className={styles.noResults}>{t('search.noResults')}</div>;
  }

  // Branded loading state for a fresh search: an animated equalizer plus
  // skeleton cards shaped exactly like real result rows, so the results
  // area holds its height and doesn't jump when songs arrive.
  if (searching && results.length === 0) {
    return (
      <div className={styles.results} aria-live="polite" aria-busy="true">
        <div className={styles.loadingHeader}>
          <span className={styles.eq} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className={styles.loadingText}>{t('search.finding')}</span>
        </div>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
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
    );
  }

  if (results.length === 0) return null;

  const visible = results.slice(0, visibleCount);

  return (
    <div className={styles.results}>
      {visible.map((song, i) => (
        <div
          key={song.videoId}
          className={styles.resultCard}
          style={{ animationDelay: `${(i % STAGGER_BATCH) * STAGGER_STEP_MS}ms` }}
        >
          <button
            type="button"
            className={styles.resultPreviewBtn}
            onClick={() => onPreview(song)}
            aria-label={t('search.previewAria')}
            title={t('search.previewAria')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnails; Next optimization adds cost/latency without benefit */}
            <img src={song.thumbnailUrl} alt="" className={styles.resultThumb} />
            <span className={styles.resultPlayIcon}>▶</span>
            {typeof song.durationSeconds === 'number' && song.durationSeconds > 0 && (
              <span className={styles.durationBadge}>
                {formatDuration(song.durationSeconds)}
              </span>
            )}
          </button>
          <div className={styles.resultInfo}>
            <span className={styles.resultTitle}>{song.title}</span>
            {typeof song.viewCount === 'number' && song.viewCount > 0 && (
              <span className={styles.resultViews}>
                {t('search.views', { count: compactViews.format(song.viewCount) })}
              </span>
            )}
          </div>
          <button
            className={styles.addBtn}
            onClick={() => onAdd(song)}
            disabled={!canAdd}
            title={
              !canAdd
                ? t('common.enterNameFirst')
                : pickMode
                ? t('search.add.choose')
                : t('search.add.add')
            }
          >
            +
          </button>
        </div>
      ))}
      <div className={styles.resultsSource}>
        <span className={styles.resultsSourceIcon} aria-hidden="true">
          {/* Official YouTube play-icon geometry (not a hand-drawn stand-in);
              white triangle painted first so it shows through the cutout. */}
          <svg width="17" height="12" viewBox="0 3.5 24 17" role="presentation" focusable="false">
            <path d="M9.545 15.568V8.432L15.818 12z" fill="#fff" />
            <path
              d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
              fill="#FF0000"
            />
          </svg>
        </span>
        <span className={styles.resultsSourceText}>{t('search.resultsSource')}</span>
      </div>
      {results.length > visibleCount && (
        <button className={styles.showMoreBtn} onClick={onShowMore}>
          {t('search.showMore')}
        </button>
      )}
    </div>
  );
};

export default SearchResults;
