import * as React from 'react';
import styles from '../styles/CheerBar.module.css';
import { CHEER_EMOJIS } from '../app/queue/cheerConstants';
import { useT } from '../lib/i18n/I18nProvider';

interface CheerBarProps {
  onReaction: (emoji: string) => void;
  cooldown: boolean;
  lastSentEmoji: string | null;
  disabled?: boolean;
  /** On small screens, collapse the wrapping grids into swipeable rows.
      Used where the bar shares space with a queue (host sidebar); the Sing
      view keeps the full-size grid. No effect above phone widths. */
  compact?: boolean;
}

const CheerBar = ({ onReaction, cooldown, lastSentEmoji, disabled, compact }: CheerBarProps): React.ReactElement => {
  const { t } = useT();
  return (
  <div className={`${styles.cheerBar} ${compact ? styles.cheerBarCompact : ''}`}>
    <div className={styles.cheerHeader}>
      <span className={styles.cheerLabel}>{t('cheer.title')}</span>
      {lastSentEmoji && (
        <span className={styles.cheerSent}>{t('cheer.sent', { emoji: lastSentEmoji })}</span>
      )}
    </div>
    <div className={styles.cheerEmojis}>
      {CHEER_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          className={`${styles.cheerBtn} ${cooldown ? styles.cheerBtnCooldown : ''}`}
          onClick={() => onReaction(emoji)}
          disabled={cooldown || disabled}
        >
          {emoji}
        </button>
      ))}
    </div>
    {cooldown && <div className={styles.cheerCooldownBar} />}
  </div>
  );
};

export default CheerBar;
