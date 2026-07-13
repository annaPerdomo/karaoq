import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { MAX_WELCOME_LENGTH } from "../../lib/limits";
import { DisplayConfig, DisplayTheme, QrSize } from "../../pages/api/types";

const QR_SIZES: QrSize[] = ["large", "normal", "small", "hidden"];
const UP_NEXT_COUNTS: (4 | 8 | 12 | 16)[] = [4, 8, 12, 16];
const THEMES: DisplayTheme[] = ["classic", "minimal", "neon"];

export function DisplaySettingsPanel({
  isOpen,
  onClose,
  config,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  config: DisplayConfig;
  onSave: (next: DisplayConfig) => void;
}) {
  const { t } = useT();
  const [welcomeDraft, setWelcomeDraft] = React.useState(config.welcomeLine);

  React.useEffect(() => {
    if (isOpen) setWelcomeDraft(config.welcomeLine);
  }, [isOpen, config.welcomeLine]);

  if (!isOpen) return null;

  function set<K extends keyof DisplayConfig>(key: K, value: DisplayConfig[K]) {
    onSave({ ...config, [key]: value });
  }

  function commitWelcome() {
    const trimmed = welcomeDraft.trim();
    setWelcomeDraft(trimmed);
    if (trimmed !== config.welcomeLine) set("welcomeLine", trimmed);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.displayPanel} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.qrModalClose}
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          &times;
        </button>
        <h3 className={styles.inviteTitle}>{t('host.display.title')}</h3>

        <div className={styles.dpSection}>
          <div className={styles.spLabel}>{t('host.display.qr')}</div>
          <div className={styles.dpSegmented}>
            {QR_SIZES.map((size) => (
              <button
                key={size}
                className={`${styles.dpSegmentBtn} ${config.qrSize === size ? styles.dpSegmentBtnActive : ""}`}
                onClick={() => set("qrSize", size)}
              >
                {t(`host.display.qr.${size}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.dpSection}>
          <button className={styles.spToggleRow} onClick={() => set("showUpNext", !config.showUpNext)}>
            <div className={styles.spBtnTitle}>{t('host.display.upNext')}</div>
            <div className={`${styles.toggle} ${config.showUpNext ? styles.toggleOn : ""}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
          {config.showUpNext && (
            <>
              <div className={styles.dpSubLabel}>{t('host.display.upNextCount')}</div>
              <div className={styles.dpSegmented}>
                {UP_NEXT_COUNTS.map((count) => (
                  <button
                    key={count}
                    className={`${styles.dpSegmentBtn} ${config.upNextCount === count ? styles.dpSegmentBtnActive : ""}`}
                    onClick={() => set("upNextCount", count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.dpSection}>
          <button className={styles.spToggleRow} onClick={() => set("showNowPlaying", !config.showNowPlaying)}>
            <div className={styles.spBtnTitle}>{t('host.display.nowPlaying')}</div>
            <div className={`${styles.toggle} ${config.showNowPlaying ? styles.toggleOn : ""}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
        </div>

        <div className={styles.dpSection}>
          <button className={styles.spToggleRow} onClick={() => set("showReactions", !config.showReactions)}>
            <div>
              <div className={styles.spBtnTitle}>{t('host.display.reactions')}</div>
              <div className={styles.spBtnDesc}>{t('host.display.reactionsDesc')}</div>
            </div>
            <div className={`${styles.toggle} ${config.showReactions ? styles.toggleOn : ""}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
        </div>

        <div className={styles.dpSection}>
          <div className={styles.spLabel}>{t('host.display.theme')}</div>
          <div className={styles.dpSegmented}>
            {THEMES.map((theme) => (
              <button
                key={theme}
                className={`${styles.dpSegmentBtn} ${config.theme === theme ? styles.dpSegmentBtnActive : ""}`}
                onClick={() => set("theme", theme)}
              >
                {t(`host.display.theme.${theme}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.dpSection}>
          <div className={styles.spLabel}>{t('host.display.welcome')}</div>
          <input
            className={styles.dpWelcomeInput}
            type="text"
            value={welcomeDraft}
            maxLength={MAX_WELCOME_LENGTH}
            placeholder={t('host.display.welcomePh')}
            onChange={(e) => setWelcomeDraft(e.target.value)}
            onBlur={commitWelcome}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitWelcome();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        <div className={styles.dpSection}>
          <button className={styles.spToggleRow} onClick={() => set("attractMode", !config.attractMode)}>
            <div>
              <div className={styles.spBtnTitle}>{t('host.display.attract')}</div>
              <div className={styles.spBtnDesc}>{t('host.display.attractDesc')}</div>
            </div>
            <div className={`${styles.toggle} ${config.attractMode ? styles.toggleOn : ""}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
