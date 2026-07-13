import * as React from 'react';

import styles from '../styles/BoardsPanel.module.css';
import SocialBoards from './SocialBoards';
import { Boards } from '../app/queue/useBoards';
import { useT } from '../lib/i18n/I18nProvider';

interface BoardsPanelProps {
  roomId: string;
  userName: string;
  boards: Boards;
  /** Singer mode is interactive; host mode adds moderation. Defaults to singer. */
  mode?: 'singer' | 'host';
}

// The collapsible "Sing together & requests" card shown below the song search
// box — the same component for singer and host.
const BoardsPanel: React.FC<BoardsPanelProps> = ({
  roomId,
  userName,
  boards,
  mode,
}) => {
  const { t } = useT();
  const { singWithMe, suggestions, open, toggleOpen, refresh } = boards;
  const count = singWithMe.length + suggestions.length;

  return (
    <div className={styles.boardsSection}>
      <button
        className={styles.boardsToggle}
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className={styles.boardsTitle}>
          <span className={styles.boardsLiveDot} />
          {t('sing.boards.toggle')}
          {count > 0 && (
            <span className={styles.boardsCountBadge}>{count}</span>
          )}
        </span>
        <span
          className={`${styles.boardsCaret} ${open ? styles.boardsCaretOpen : ''}`}
        >
          &#x25BE;
        </span>
      </button>
      {open && (
        <div className={styles.boardsBody}>
          <span className={styles.boardsSub}>
            {t('sing.boards.sub', { code: roomId.toUpperCase() })}
          </span>
          <SocialBoards
            roomId={roomId}
            userName={userName}
            singWithMe={singWithMe}
            suggestions={suggestions}
            mode={mode}
            onChange={refresh}
          />
        </div>
      )}
    </div>
  );
};

export default BoardsPanel;
