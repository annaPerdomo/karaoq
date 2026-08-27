import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SearchFailure } from '../../app/queue/searchYoutube';
import { formatCountdown } from '../../lib/duration';
import { useT } from '../../lib/i18n/I18nProvider';
import BrokenLinkIcon from './BrokenLinkIcon';
import NotesIcon from './NotesIcon';

const LINK_MESSAGE_KEYS: Record<NonNullable<SearchFailure['link']>, string> = {
  not_found: 'search.linkNotFound',
  not_embeddable: 'search.linkNotEmbeddable',
  no_video: 'search.linkNoVideo',
  not_youtube: 'search.linkNotYoutube',
};

interface SearchUnavailableProps {
  searchError: SearchFailure;
  /** Empty when the failure came from a paste, where the box holds a URL. */
  searchedQuery: string;
  /** False when the text wasn't a YouTube video link — refused that way rather
   *  than as a failure, so this panel survives to offer its other ways out. */
  onPasteLink: (text: string) => boolean;
}

/** Ordinary linking, not an API call: spends no quota, and stays inside the API
 *  Services terms that rule out rendering YouTube's results ourselves. */
function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Shown when the backend couldn't run the search. It offers a paste because
 * `videos.list` draws on a 10,000-unit pool separate from the 100-calls-a-day
 * `search.list` bucket, so it keeps answering long after search stops.
 */
const SearchUnavailable: React.FC<SearchUnavailableProps> = ({
  searchError,
  searchedQuery,
  onPasteLink,
}) => {
  const { t } = useT();
  // After mount: reading it during render would disagree with the SSR markup.
  const [canReadClipboard, setCanReadClipboard] = React.useState(false);
  const [pasteProblem, setPasteProblem] = React.useState<
    'denied' | 'not_link' | null
  >(null);

  React.useEffect(() => {
    setCanReadClipboard(typeof navigator?.clipboard?.readText === 'function');
  }, []);

  async function readClipboard() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Permission refused, or a browser that only allows it behind a prompt.
    }
    if (!text.trim()) {
      setPasteProblem('denied');
      return;
    }
    // The likely tap, not the rare one: routing the refusal through a failure
    // would replace this whole panel, and its other ways out, with one sentence.
    setPasteProblem(onPasteLink(text) ? null : 'not_link');
  }

  // Null rather than NaN: a mangled body falls back to the generic copy.
  const msLeft = searchError.resetsAt
    ? new Date(searchError.resetsAt).getTime() - Date.now()
    : NaN;
  const secondsLeft = Number.isFinite(msLeft) ? Math.max(0, msLeft / 1000) : null;
  const linkKey = searchError.link ? LINK_MESSAGE_KEYS[searchError.link] : null;

  if (linkKey) {
    return (
      <div className={styles.unavailable}>
        <BrokenLinkIcon className={styles.unavailableIcon} />
        <p className={styles.unavailableBody}>{t(linkKey)}</p>
      </div>
    );
  }

  const quotaMessage = searchError.quota && secondsLeft !== null;
  // Only where the server named a ceiling: an outage and a phone that dropped
  // the venue wifi land here too, and hit no limit at all.
  const limitMessage = searchError.quota || searchError.busy;
  // Held back when the paste is what just failed, or we'd loop them.
  const offerLink = searchError.source !== 'lookup';

  return (
    <div className={styles.unavailable}>
      <NotesIcon className={styles.unavailableIcon} />
      <p className={styles.unavailableTitle}>
        {quotaMessage
          ? t('search.unavailable.quotaTitle')
          : limitMessage
            ? t('search.unavailable.title')
            : t('search.unavailable.genericTitle')}
      </p>
      <p className={styles.unavailableBody}>
        {quotaMessage
          ? t('search.unavailable.quotaBody', { time: formatCountdown(secondsLeft, t) })
          : limitMessage
            ? t('search.unavailable.body')
            : t('search.unavailable.genericBody')}
      </p>
      {offerLink && (
        <div className={styles.unavailablePaste}>
          <p className={styles.unavailablePasteText}>{t('search.pasteHint')}</p>
          {searchedQuery && (
            // New tab: navigating this one away loses the room and the queue.
            <a
              className={styles.unavailableAction}
              href={youtubeSearchUrl(searchedQuery)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.unavailableActionLabel}>
                {t('search.findOnYoutube', { query: searchedQuery })}
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
          {canReadClipboard && (
            <button
              type="button"
              className={styles.unavailableAction}
              onClick={readClipboard}
            >
              <span className={styles.unavailableActionLabel}>
                {t('search.pasteFromClipboard')}
              </span>
            </button>
          )}
          {pasteProblem && (
            <p className={styles.unavailableDenied}>
              {pasteProblem === 'denied'
                ? t('search.pasteClipboardDenied')
                : t('search.pasteNotLink')}
            </p>
          )}
        </div>
      )}
      {/* Cuts come from the corpus, which spends no quota, so ideas outlive it
          however it was spent — including on a paste. */}
      <p className={styles.unavailableBody}>{t('search.quotaIdeasHint')}</p>
      {/* Outside the quota body so it reads once, not twice on one failure —
          and only where we hit a limit, since it names one. */}
      {limitMessage && (
        <p className={styles.unavailableFooter}>{t('search.limitWorkHint')}</p>
      )}
    </div>
  );
};

export default SearchUnavailable;
