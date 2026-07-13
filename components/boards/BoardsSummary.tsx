import * as React from 'react';

import styles from '../../styles/BoardsSummary.module.css';
import { SingWithMePost, SuggestedSong } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import decodeHtml from '../../lib/decodeHtml';

// Neither surface scrolls this list, so show a handful and count the rest.
const MAX_ITEMS = 4;

interface BoardsSummaryProps {
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  cta?: string;
  onOpen?: () => void;
}

// Read-only roll-up of both boards, shown on the display and in the host's
// sidebar. Posting, joining and moderating all happen in BoardsPanel.
const BoardsSummary: React.FC<BoardsSummaryProps> = ({
  singWithMe,
  suggestions,
  cta,
  onOpen,
}) => {
  const { t, tn } = useT();

  // A full post has nothing left to recruit for; the ones still short of their
  // minimum are the ones that need the room's attention, so they lead.
  const open = singWithMe.filter((p) => p.joinedSingers.length < p.maxSingers);
  const posts = [...open.filter((p) => !p.queued), ...open.filter((p) => p.queued)];

  const total = posts.length + suggestions.length;
  if (total === 0) return null;

  const shownPosts = posts.slice(0, MAX_ITEMS);
  const shownSuggestions = suggestions.slice(0, MAX_ITEMS - shownPosts.length);
  const hidden = total - shownPosts.length - shownSuggestions.length;

  const body = (
    <>
      <h3 className={styles.title}>
        {t('boards.summary.title')}
        <span className={styles.count}>{total}</span>
      </h3>
      {shownPosts.map((post) => {
        const joined = post.joinedSingers.length;
        return (
          <div key={post.id} className={styles.item}>
            <span className={styles.song}>{decodeHtml(post.songTitle)}</span>
            <span className={styles.metaRow}>
              <span className={styles.tag}>{t('boards.tab.singTogether')}</span>
              <span className={styles.meta}>
                {!post.queued
                  ? tn('boards.needMore', post.minSingers - joined)
                  : t('boards.roomFor', {
                      count: joined,
                      more: post.maxSingers - joined,
                    })}
              </span>
            </span>
            {joined > 0 && (
              <span className={styles.names}>
                {t('boards.singing', { names: post.joinedSingers.join(', ') })}
              </span>
            )}
          </div>
        );
      })}
      {shownSuggestions.map((s) => (
        <div key={s.id} className={styles.item}>
          <span className={styles.song}>{decodeHtml(s.songTitle)}</span>
          <span className={styles.metaRow}>
            <span className={`${styles.tag} ${styles.tagRequest}`}>
              {t('boards.tab.requests')}
            </span>
            <span className={styles.meta}>
              {t('boards.requestedBy', {
                name:
                  s.anonymous || !s.suggestedBy
                    ? t('boards.anonymous')
                    : s.suggestedBy,
              })}
            </span>
          </span>
        </div>
      ))}
      {hidden > 0 && (
        <div className={styles.moreCount}>
          {t('display.moreCount', { count: hidden })}
        </div>
      )}
      {cta && <div className={styles.cta}>{cta}</div>}
    </>
  );

  if (onOpen) {
    return (
      <button className={`${styles.summary} ${styles.summaryBtn}`} onClick={onOpen}>
        {body}
        <span className={styles.openHint}>{t('boards.summary.open')}</span>
      </button>
    );
  }

  return <div className={styles.summary}>{body}</div>;
};

export default BoardsSummary;
