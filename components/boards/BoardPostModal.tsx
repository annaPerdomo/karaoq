import * as React from 'react';

import styles from '../../styles/SocialBoards.module.css';
import SongSearch from '../SongSearch';
import Stepper from './Stepper';
import { BoardTab } from './types';
import { YoutubeResult } from '../../app/queue/searchYoutube';
import { useT } from '../../lib/i18n/I18nProvider';

export interface BoardDraft {
  song: YoutubeResult;
  anonymous: boolean;
  /** Only meaningful for a "Sing with me" post. */
  minSingers: number;
  maxSingers: number;
}

interface BoardPostModalProps {
  tab: BoardTab;
  roomId: string;
  /** The poster's display name; empty when they haven't entered one. */
  name: string;
  busy: boolean;
  onSubmit: (draft: BoardDraft) => void;
  onClose: () => void;
}

// "Post a song to sing together" / "Request a song": search for a song, confirm
// it's the right cover, set the singer counts, then post.
//
// The draft lives here rather than in SocialBoards because it exists only
// while this modal is open — closing it is what discards the draft.
const BoardPostModal: React.FC<BoardPostModalProps> = ({
  tab,
  roomId,
  name,
  busy,
  onSubmit,
  onClose,
}) => {
  const { t } = useT();
  const [picked, setPicked] = React.useState<YoutubeResult | null>(null);
  const [anonymous, setAnonymous] = React.useState(false);
  const [minSingers, setMinSingers] = React.useState(2);
  const [maxSingers, setMaxSingers] = React.useState(4);
  const [playing, setPlaying] = React.useState(false);

  function pickSong(song: YoutubeResult | null) {
    setPicked(song);
    setPlaying(false);
  }

  function submit() {
    if (!picked || busy) return;
    onSubmit({
      song: picked,
      anonymous,
      minSingers,
      maxSingers: Math.max(minSingers, maxSingers),
    });
  }

  const isSingWithMe = tab === 'singwithme';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            {isSingWithMe ? t('boards.modal.singTogether') : t('boards.modal.request')}
          </h3>
          <button className={styles.modalClose} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {!picked ? (
          <SongSearch
            roomId={roomId}
            userName={name}
            onSongAdded={() => {}}
            showFilters={false}
            onPick={pickSong}
          />
        ) : (
          <div className={styles.draft}>
            <div className={styles.previewWrap}>
              {playing ? (
                <iframe
                  className={styles.previewFrame}
                  src={`https://www.youtube.com/embed/${picked.videoId}?autoplay=1&rel=0`}
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
                  <img src={picked.thumbnailUrl} alt="" className={styles.previewThumb} />
                  <span className={styles.previewPlayIcon}>▶</span>
                </button>
              )}
            </div>
            <p className={styles.draftSong}>{picked.title}</p>
            <button className={styles.changeBtn} onClick={() => pickSong(null)}>
              {t('boards.chooseDifferent')}
            </button>

            {isSingWithMe && (
              <div className={styles.stepperRow}>
                <Stepper
                  label={t('boards.singersNeeded')}
                  value={minSingers}
                  min={2}
                  max={20}
                  onChange={(v) => {
                    setMinSingers(v);
                    if (v > maxSingers) setMaxSingers(v);
                  }}
                />
                <Stepper
                  label={t('boards.maxSingers')}
                  value={Math.max(minSingers, maxSingers)}
                  min={minSingers}
                  max={20}
                  onChange={setMaxSingers}
                />
              </div>
            )}

            <label className={styles.anonRow}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              {t('boards.postAnon')}
            </label>

            <button className={styles.submitBtn} onClick={submit} disabled={busy}>
              {isSingWithMe ? t('boards.postIt') : t('boards.requestIt')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardPostModal;
