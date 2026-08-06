import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

export interface HeroCtaCardProps {
  hostName: string;
  customCode: string;
  joinCode: string;
  showCustom: boolean;
  showJoin: boolean;
  creating: boolean;
  hostError: string;
  nameInputRef: React.RefObject<HTMLInputElement>;
  onHostNameChange: (value: string) => void;
  onCustomCodeChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onToggleCustom: () => void;
  onShowJoin: () => void;
  onHost: (useCustom: boolean) => void;
  onJoin: () => void;
}

export default function HeroCtaCard(props: HeroCtaCardProps) {
  const { t } = useT();
  const {
    hostName, customCode, joinCode, showCustom, showJoin, creating, hostError,
    nameInputRef, onHostNameChange, onCustomCodeChange, onJoinCodeChange,
    onToggleCustom, onShowJoin, onHost, onJoin,
  } = props;

  return (
    <div className={styles.heroCta}>
      {/* One glass card holds the whole way in: host a room (custom
          codes tucked behind a small toggle), or join with a code. */}
      <div className={styles.hostCard}>
        <span className={styles.hostCardKicker}>
          {t('home.host.kicker')}
        </span>
        <input
            ref={nameInputRef}
            className={styles.nameInput}
            placeholder={t('common.yourName')}
            aria-label={t('common.yourName')}
            maxLength={30}
            value={hostName}
            onChange={(e) => onHostNameChange(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && onHost(showCustom)
            }
          />

          {!showCustom ? (
            <button
              className={styles.btnPrimary}
              onClick={() => onHost(false)}
              disabled={creating}
            >
              {creating ? t('home.creating') : t('home.host.start')}
            </button>
          ) : (
            <div className={styles.joinRow}>
              <input
                className={styles.joinInput}
                placeholder={t('home.host.customPlaceholder')}
                aria-label={t('home.host.customAria')}
                maxLength={12}
                value={customCode}
                onChange={(e) => onCustomCodeChange(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && onHost(true)}
                autoFocus
              />
              <button
                className={styles.btnPrimary}
                onClick={() => onHost(true)}
                disabled={creating || !customCode.trim()}
              >
                {creating ? t('home.creating') : t('home.host.create')}
              </button>
            </div>
          )}

          <button
            type="button"
            className={styles.textToggle}
            onClick={onToggleCustom}
          >
            {showCustom
              ? t('home.host.useRandom')
              : t('home.host.useCustom')}
          </button>

        {hostError && <p className={styles.hostError}>{hostError}</p>}

        {/* Secondary path: joining with a code (most guests arrive by
            scanning a QR, so this stays lightweight). */}
        <div className={styles.joinPrompt}>
          {!showJoin ? (
            <button
              type="button"
              className={styles.joinLink}
              onClick={onShowJoin}
            >
              {t('home.join.haveCode')} <span>{t('home.join.link')}</span>
            </button>
          ) : (
            <div className={styles.joinRow}>
              <input
                className={styles.joinInput}
                placeholder={t('home.join.roomPlaceholder')}
                aria-label={t('home.join.roomAria')}
                maxLength={12}
                value={joinCode}
                onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && onJoin()}
                autoFocus
              />
              <button
                className={styles.btnOutline}
                onClick={onJoin}
                disabled={!joinCode.trim()}
              >
                {t('home.join.button')}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className={styles.heroNote}>{t('home.hero.note')}</p>
    </div>
  );
}
