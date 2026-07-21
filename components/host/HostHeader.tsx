import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import LanguageSwitcher from "../LanguageSwitcher";
import { Icons } from "./icons";
import { SettingsPopover } from "./SettingsPopover";

// The top bar: brand, the playback-mode pill + menu (host only), the language
// switcher, the settings gear, and the settings popover it toggles.
export function HostHeader({
  remote,
  tvMode,
  customizing,
  canCustomize,
  onCustomize,
  modeMenuOpen,
  onModePillClick,
  onModeMenuBackdropClick,
  onPlayHere,
  onOpenTvDisplay,
  settingsOpen,
  onGearClick,
  onSettingsClose,
  reactionsOn,
  onToggleReactions,
  fairMode,
  onToggleFairMode,
  hostName,
  onChangeName,
  onInviteCohost,
  onBrandClick,
}: {
  remote: boolean;
  tvMode: boolean;
  /** True while the host is in Customize mode — the rail + save bar take over,
   * so the pill and gear step aside. */
  customizing: boolean;
  /** Whether the Customize button shows (host only, once loaded). */
  canCustomize: boolean;
  onCustomize: () => void;
  modeMenuOpen: boolean;
  onModePillClick: () => void;
  onModeMenuBackdropClick: () => void;
  onPlayHere: () => void;
  onOpenTvDisplay: () => void;
  settingsOpen: boolean;
  onGearClick: () => void;
  onSettingsClose: () => void;
  reactionsOn: boolean;
  onToggleReactions: () => void;
  fairMode: boolean;
  onToggleFairMode: () => void;
  hostName: string;
  onChangeName: () => void;
  onInviteCohost: () => void;
  onBrandClick: () => void;
}) {
  const { t } = useT();
  return (
    <header className={styles.header}>
      <div className={styles.brand} onClick={onBrandClick}>
        KaraoQ
        {remote && <span className={styles.cohostBadge}>{t('host.role.cohost')}</span>}
      </div>

      {/* Playback-mode pill: shows where the video plays and switches in one tap. */}
      {!remote && !customizing && (
        <div className={styles.modePillWrap}>
          <button
            className={styles.modePill}
            onClick={onModePillClick}
            title={t('host.mode.pillTitle')}
          >
            {tvMode ? Icons.tv : Icons.monitor}
            <span className={styles.modePillText}>
              {tvMode ? t('host.mode.playingTv') : t('host.mode.playingHere')}
            </span>
            <span className={styles.modePillCaret}>{Icons.caret}</span>
          </button>
          {modeMenuOpen && (
            <>
              <div
                className={styles.menuBackdrop}
                onClick={onModeMenuBackdropClick}
              />
              <div className={styles.modeMenu}>
                <div className={styles.spLabel}>{t('host.mode.menuLabel')}</div>
                <button
                  className={`${styles.modeMenuItem} ${!tvMode ? styles.modeMenuItemActive : ""}`}
                  onClick={onPlayHere}
                >
                  {Icons.monitor}
                  <div>
                    <div className={styles.spBtnTitle}>{t('host.mode.thisScreen')}</div>
                    <div className={styles.spBtnDesc}>
                      {t('host.mode.thisScreenDesc')}
                    </div>
                  </div>
                  {!tvMode && <span className={styles.modeCheck}>✓</span>}
                </button>
                <button
                  className={`${styles.modeMenuItem} ${tvMode ? styles.modeMenuItemActive : ""}`}
                  onClick={onOpenTvDisplay}
                >
                  {Icons.tv}
                  <div>
                    <div className={styles.spBtnTitle}>
                      {t('host.mode.diffScreen')}
                    </div>
                    <div className={styles.spBtnDesc}>
                      {tvMode
                        ? t('host.mode.reopen')
                        : t('host.mode.cast')}
                    </div>
                  </div>
                  {tvMode && <span className={styles.modeCheck}>✓</span>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.headerActions}>
        {canCustomize && !customizing && (
          <button
            className={styles.headerCustomize}
            onClick={onCustomize}
            title={t('host.customize.button')}
          >
            {Icons.brush}
            <span className={styles.headerCustomizeLabel}>{t('host.customize.button')}</span>
          </button>
        )}
        <LanguageSwitcher />
        {!customizing && (
          <button
            className={`${styles.gearBtn} ${settingsOpen ? styles.gearBtnOpen : ""}`}
            onClick={onGearClick}
            aria-label={t('host.settingsAria')}
          >
            {Icons.gear}
          </button>
        )}
      </div>
      <SettingsPopover
        isOpen={settingsOpen}
        onClose={onSettingsClose}
        remote={remote}
        reactionsOn={reactionsOn}
        onToggleReactions={onToggleReactions}
        fairMode={fairMode}
        onToggleFairMode={onToggleFairMode}
        hostName={hostName}
        onChangeName={onChangeName}
        onInviteCohost={onInviteCohost}
      />
    </header>
  );
}
