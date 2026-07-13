import * as React from 'react';

import styles from '../../styles/SocialBoards.module.css';
import { SingWithMePost } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import decodeHtml from '../../lib/decodeHtml';
import { pencil } from './icons';

interface SingWithMeCardProps {
  post: SingWithMePost;
  /** Hosts can edit and remove anyone's post, not just their own. */
  isHost: boolean;
  isOwn: boolean;
  /** The viewer's display name; empty until they've entered one. */
  name: string;
  busy: boolean;
  onJoin: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onPreview: () => void;
}

const SingWithMeCard: React.FC<SingWithMeCardProps> = ({
  post,
  isHost,
  isOwn,
  name,
  busy,
  onJoin,
  onEdit,
  onRemove,
  onPreview,
}) => {
  const { t, tn } = useT();
  const joined = post.joinedSingers.length;
  const alreadyIn = !!name && post.joinedSingers.includes(name);
  const full = joined >= post.maxSingers;
  const canRemove = isHost || isOwn;
  // Editing a queued post would leave the board and the queue pointing at
  // different videos; once it's queued, the queue is where it's managed.
  const canEdit = canRemove && !post.queued;

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardMain}>
          <span className={styles.cardSong}>{decodeHtml(post.songTitle)}</span>
          {/* A named poster already leads the "Singing:" list below,
              so only call out anonymous posts. */}
          {(post.anonymous || !post.createdBy) && (
            <span className={styles.cardMeta}>{t('boards.postedAnon')}</span>
          )}
          <div className={styles.progressRow}>
            <span className={styles.progressText}>
              {!post.queued
                ? tn('boards.needMore', post.minSingers - joined)
                : full
                ? t('boards.full', { count: joined })
                : t('boards.roomFor', { count: joined, more: post.maxSingers - joined })}
            </span>
            {post.queued && <span className={styles.queuedBadge}>{t('boards.inQueue')}</span>}
          </div>
          {post.joinedSingers.length > 0 && (
            <span className={styles.joinedNames}>
              {t('boards.singing', { names: post.joinedSingers.join(', ') })}
            </span>
          )}
        </div>
        {canRemove && (
          <div className={styles.cardTools}>
            {canEdit && (
              <button
                className={styles.editBtn}
                onClick={onEdit}
                disabled={busy}
                aria-label={isHost ? t('boards.editPost') : t('boards.editYourPost')}
                title={isHost ? t('boards.editPost') : t('boards.editYourPost')}
              >
                {pencil}
              </button>
            )}
            <button
              className={styles.removeBtn}
              onClick={onRemove}
              disabled={busy}
              aria-label={isHost ? t('boards.removePost') : t('boards.removeYourPost')}
              title={isHost ? t('boards.removePost') : t('boards.removeYourPost')}
            >
              ×
            </button>
          </div>
        )}
      </div>
      <div className={styles.cardActions}>
        <button
          className={styles.previewBtn}
          onClick={onPreview}
          aria-label={t('boards.previewAria')}
          title={t('boards.previewAria')}
        >
          <span className={styles.previewBtnIcon}>▶</span> {t('boards.preview')}
        </button>
        {!isOwn && (
          <button
            className={`${styles.joinBtn} ${alreadyIn ? styles.joinBtnDone : ''}`}
            onClick={onJoin}
            disabled={busy || alreadyIn || full || !name}
            title={!name ? t('common.enterNameFirst') : undefined}
          >
            {alreadyIn ? t('boards.joined') : full ? t('boards.full.short') : t('boards.join')}
          </button>
        )}
      </div>
    </div>
  );
};

export default SingWithMeCard;
