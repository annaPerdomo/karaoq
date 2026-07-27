import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { YoutubeResult } from '../../app/queue/searchYoutube';
import { formatDuration } from '../../lib/duration';
import { useT } from '../../lib/i18n/I18nProvider';

interface SearchResultsProps {
  hasSearched: boolean;
  searching: boolean;
  results: YoutubeResult[];
  /** How many results are revealed; the rest sit behind "Show more". */
  visibleCount: number;
  canAdd: boolean;
  /** Picker mode ("Sing with me" / Suggestions boards) vs. add-to-queue. */
  pickMode: boolean;
  onPreview: (song: YoutubeResult) => void;
  onAdd: (song: YoutubeResult) => void;
  onShowMore: () => void;
}

const SKELETON_COUNT = 8;
// Stagger resets each "Show more" batch so newly revealed rows animate in
// from the top of the batch instead of waiting out the full list's delays.
const STAGGER_BATCH = 8;
const STAGGER_STEP_MS = 45;

const SearchResults: React.FC<SearchResultsProps> = ({
  hasSearched,
  searching,
  results,
  visibleCount,
  canAdd,
  pickMode,
  onPreview,
  onAdd,
  onShowMore,
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
      {results.length > visibleCount && (
        <button className={styles.showMoreBtn} onClick={onShowMore}>
          {t('search.showMore')}
        </button>
      )}
    </div>
  );
};

export default SearchResults;
