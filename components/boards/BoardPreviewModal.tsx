import * as React from 'react';

import styles from '../../styles/SocialBoards.module.css';
import { PreviewTarget } from './types';
import { useT } from '../../lib/i18n/I18nProvider';
import decodeHtml from '../../lib/decodeHtml';

interface BoardPreviewModalProps {
  target: PreviewTarget;
  /** The viewer's display name; empty until they've entered one. */
  name: string;
  busy: boolean;
  /** Join a "Sing with me" post, or claim a request — whichever this is. */
  onAct: () => void;
  onClose: () => void;
}

// Plays the posted video so people can confirm it's the cover/version they
// want before joining or claiming it. Shared by both boards — only the action
// button below the player differs.
const BoardPreviewModal: React.FC<BoardPreviewModalProps> = ({
  target,
  name,
  busy,
  onAct,
  onClose,
}) => {
  const { t } = useT();
  const [playing, setPlaying] = React.useState(false);

  const isSingWithMe = target.kind === 'singwithme';
  const joined = isSingWithMe ? target.post.joinedSingers.length : 0;
  const alreadyIn =
    target.kind === 'singwithme' && !!name && target.post.joinedSingers.includes(name);
  const full = target.kind === 'singwithme' && joined >= target.post.maxSingers;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('boards.preview')}</h3>
          <button className={styles.modalClose} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className={styles.draft}>
          <div className={styles.previewWrap}>
            {playing ? (
              <iframe
                className={styles.previewFrame}
                src={`https://www.youtube.com/embed/${target.post.videoId}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className={styles.previewPlayBtn}
                onClick={() => setPlaying(true)}
                title={t('boards.previewAria')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
                <img
                  src={`https://i.ytimg.com/vi/${target.post.videoId}/hqdefault.jpg`}
                  alt=""
                  className={styles.previewThumb}
                />
                <span className={styles.previewPlayIcon}>▶</span>
              </button>
            )}
          </div>
          <p className={styles.draftSong}>{decodeHtml(target.post.songTitle)}</p>

          {!isSingWithMe && (
            <button
              className={styles.submitBtn}
              onClick={onAct}
              disabled={busy || !name}
              title={!name ? t('common.enterNameFirst') : undefined}
            >
              {t('boards.illSing')}
            </button>
          )}

          {isSingWithMe && (
            <button
              className={styles.submitBtn}
              onClick={onAct}
              disabled={busy || alreadyIn || full || !name}
              title={!name ? t('common.enterNameFirst') : undefined}
            >
              {alreadyIn ? t('boards.joined') : full ? t('boards.full.short') : t('boards.join')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BoardPreviewModal;
