import * as React from 'react';
import styles from '../styles/CheerBar.module.css';
import { CHEER_EMOJIS, CHEER_MESSAGES } from '../app/queue/cheerConstants';

interface CheerBarProps {
  onReaction: (emoji: string) => void;
  cooldown: boolean;
  lastSentEmoji: string | null;
  disabled?: boolean;
}

const CheerBar = ({ onReaction, cooldown, lastSentEmoji, disabled }: CheerBarProps): React.ReactElement => (
  <div className={styles.cheerBar}>
    <div className={styles.cheerHeader}>
      <span className={styles.cheerLabel}>Cheer them on!</span>
      {lastSentEmoji && (
        <span className={styles.cheerSent}>{lastSentEmoji} Sent!</span>
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
    <div className={styles.cheerMessages}>
      {CHEER_MESSAGES.map((msg) => (
        <button
          key={msg}
          className={`${styles.cheerMsgBtn} ${cooldown ? styles.cheerBtnCooldown : ''}`}
          onClick={() => onReaction(msg)}
          disabled={cooldown || disabled}
        >
          {msg}
        </button>
      ))}
    </div>
    {cooldown && <div className={styles.cheerCooldownBar} />}
  </div>
);

export default CheerBar;
