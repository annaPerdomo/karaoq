import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SongSelection } from '../../app/queue/searchYoutube';
import { youtubeWatchUrl } from '../../lib/externalEntry';
import { useT } from '../../lib/i18n/I18nProvider';

interface ConfirmModalProps {
  song: SongSelection;
  previewPlaying: boolean;
  onPlayPreview: () => void;
  /** Picker mode ("Sing with me" / Suggestions boards) vs. add-to-queue. */
  pickMode: boolean;
  userName: string;
  adding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  song,
  previewPlaying,
  onPlayPreview,
  pickMode,
  userName,
  adding,
  onConfirm,
  onCancel,
}) => {
  const { t } = useT();

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{pickMode ? t('search.confirm.preview') : t('search.confirm.addTitle')}</h3>
        <div className={styles.previewWrap}>
          {previewPlaying ? (
            <iframe
              className={styles.previewFrame}
              src={`https://www.youtube.com/embed/${song.videoId}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : song.external ? (
            <a
              className={styles.previewPlayBtn}
              href={youtubeWatchUrl(song.videoId)}
              target="_blank"
              rel="noopener noreferrer"
              title={t('search.confirm.previewVideo')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
              <img src={song.thumbnailUrl} alt="" className={styles.modalThumb} />
              <span className={styles.previewPlayIcon}>▶</span>
            </a>
          ) : (
            <button
              type="button"
              className={styles.previewPlayBtn}
              onClick={onPlayPreview}
              title={t('search.confirm.previewVideo')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
              <img
                src={song.thumbnailUrl}
                alt=""
                className={styles.modalThumb}
              />
              <span className={styles.previewPlayIcon}>▶</span>
            </button>
          )}
        </div>
        <p className={styles.modalSong}>{song.title}</p>
        {song.external && <p className={styles.modalAs}>{t('search.refused.confirmNote')}</p>}
        {!pickMode && (
          <p className={styles.modalAs}>
            {t('search.confirm.addingAs').split(/(\{name\})/).map((part, i) =>
              part === '{name}' ? <strong key={i}>{userName}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
            )}
          </p>
        )}
        <div className={styles.modalActions}>
          <button
            className={styles.btnPrimary}
            onClick={onConfirm}
            disabled={adding}
          >
            {pickMode ? t('search.confirm.choose') : t('search.confirm.add')}
          </button>
          <button
            className={styles.btnGhost}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
