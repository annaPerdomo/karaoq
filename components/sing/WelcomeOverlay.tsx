import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { CHEER_EMOJIS } from '../../app/queue/cheerConstants';
import formatSongTitle from '../../lib/songTitle';

const CHEERED_DISMISS_MS = 1500;

interface WelcomeOverlayProps {
  joinCode: string;
  onSubmit: (name: string) => void;
  onSkip: () => void;
  onStage?: { userName: string; songTitle: string };
  onCheer?: (emoji: string) => void;
  cooldown?: boolean;
  lastSentEmoji?: string | null;
}

const WelcomeOverlay = ({ joinCode, onSubmit, onSkip, onStage, onCheer, cooldown, lastSentEmoji }: WelcomeOverlayProps): React.ReactElement => {
  const { t } = useT();
  const [welcomeName, setWelcomeName] = React.useState('');
  const [cheered, setCheered] = React.useState(false);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    onSubmit(name);
  }

  // Typing after a cheer means they're staying; the card must not leave mid-keystroke.
  function cancelDismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }

  function handleCheer(emoji: string) {
    onCheer?.(emoji);
    setCheered(true);
    // One timer across rapid taps: the card leaves after the last one, not the first.
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onSkip, CHEERED_DISMISS_MS);
  }

  const cheerFirst = !!onStage && !!onCheer;

  return (
    <div className={styles.welcomeOverlay}>
      <div className={`${styles.welcomeCard} ${cheerFirst ? styles.welcomeCardStage : ''}`}>
        <div className={styles.welcomeLogo}>KaraoQ</div>
        <p className={styles.welcomeRoom}>
          {t('sing.welcome.room').split(/(\{code\})/).map((part, i) =>
            part === '{code}'
              ? <strong key={i}>{joinCode.toUpperCase()}</strong>
              : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </p>

        {cheerFirst && (
          <div className={styles.welcomeStage}>
            <span className={styles.welcomeStageTag}>
              <span className={styles.nowDot} />
              {t('sing.welcome.onStage', { name: onStage!.userName })}
            </span>
            <span className={styles.welcomeStageSong}>{formatSongTitle(onStage!.songTitle)}</span>
            <div className={styles.welcomeCheerRow}>
              {CHEER_EMOJIS.slice(0, 5).map((emoji) => (
                <button
                  key={emoji}
                  className={`${styles.welcomeCheerBtn} ${cooldown ? styles.welcomeCheerBtnCooldown : ''}`}
                  onClick={() => handleCheer(emoji)}
                  disabled={cooldown}
                  aria-label={t('sing.cheer.sendAria', { emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <span className={`${styles.welcomeCheerHint} ${cheered ? styles.welcomeCheerHintSent : ''}`}>
              {cheered && lastSentEmoji
                ? t('sing.quickCheer.sent', { emoji: lastSentEmoji })
                : t('sing.welcome.cheerNow')}
            </span>
          </div>
        )}

        <h2 className={styles.welcomePrompt}>
          {cheerFirst ? t('sing.welcome.singToo') : t('sing.welcome.prompt')}
        </h2>
        <input
          className={styles.welcomeInput}
          placeholder={t('common.enterYourName')}
          value={welcomeName}
          onFocus={cancelDismiss}
          onChange={(e) => {
            cancelDismiss();
            setWelcomeName(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleWelcomeSubmit()}
          autoFocus={!cheerFirst}
          maxLength={30}
        />
        <button
          className={styles.welcomeBtn}
          onClick={handleWelcomeSubmit}
          disabled={!welcomeName.trim()}
        >
          {t('sing.welcome.go')}
        </button>
        {!cheerFirst && <p className={styles.welcomeCheerTip}>{t('sing.welcome.cheerTip')}</p>}
        <button className={styles.welcomeSkip} onClick={onSkip}>
          {t('sing.welcome.skip')}
        </button>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
