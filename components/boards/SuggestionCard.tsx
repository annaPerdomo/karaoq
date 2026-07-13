import * as React from 'react';

import styles from '../../styles/SocialBoards.module.css';
import { SuggestedSong } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import decodeHtml from '../../lib/decodeHtml';
import { pencil } from './icons';

interface SuggestionCardProps {
  suggestion: SuggestedSong;
  /** Hosts can edit and remove anyone's request, not just their own. */
  isHost: boolean;
  isOwn: boolean;
  /** The viewer's display name; empty until they've entered one. */
  name: string;
  busy: boolean;
  onClaim: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onPreview: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  isHost,
  isOwn,
  name,
  busy,
  onClaim,
  onEdit,
  onRemove,
  onPreview,
}) => {
  const { t } = useT();
  const canRemove = isHost || isOwn;

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardMain}>
          <span className={styles.cardSong}>{decodeHtml(suggestion.songTitle)}</span>
          <span className={styles.cardMeta}>
            {t('boards.requestedBy', {
              name:
                suggestion.anonymous || !suggestion.suggestedBy
                  ? t('boards.anonymous')
                  : suggestion.suggestedBy,
            })}
          </span>
        </div>
        {canRemove && (
          <div className={styles.cardTools}>
            <button
              className={styles.editBtn}
              onClick={onEdit}
              disabled={busy}
              aria-label={isHost ? t('boards.editRequest') : t('boards.editYourRequest')}
              title={isHost ? t('boards.editRequest') : t('boards.editYourRequest')}
            >
              {pencil}
            </button>
            <button
              className={styles.removeBtn}
              onClick={onRemove}
              disabled={busy}
              aria-label={isHost ? t('boards.removeRequest') : t('boards.removeYourRequest')}
              title={isHost ? t('boards.removeRequest') : t('boards.removeYourRequest')}
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
            className={styles.joinBtn}
            onClick={onClaim}
            disabled={busy || !name}
            title={!name ? t('common.enterNameFirst') : undefined}
          >
            {t('boards.illSing')}
          </button>
        )}
      </div>
    </div>
  );
};

export default SuggestionCard;
