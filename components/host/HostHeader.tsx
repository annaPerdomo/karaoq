import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import LanguageSwitcher from "../LanguageSwitcher";
import { Icons } from "./icons";
import { SettingsPopover } from "./SettingsPopover";

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
  sessionEndsAt,
  onChangeSessionEnd,
  hostName,
  onChangeName,
  onInviteCohost,
  onPrintQr,
  onSendFeedback,
  onBrandClick,
}: {
  remote: boolean;
  tvMode: boolean;
  customizing: boolean;
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
  sessionEndsAt: number | null;
  onChangeSessionEnd: (endsAt: number | null) => void;
  hostName: string;
  onChangeName: () => void;
  onInviteCohost: () => void;
  onPrintQr: () => void;
  onSendFeedback: () => void;
  onBrandClick: () => void;
}) {
  const { t } = useT();
  return (
    <header className={styles.header}>
      <div className={styles.brand} onClick={onBrandClick}>
        KaraoQ
        {remote && <span className={styles.cohostBadge}>{t('host.role.cohost')}</span>}
      </div>

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
            title={t('customize.button')}
          >
            {Icons.brush}
            <span className={styles.headerCustomizeLabel}>{t('customize.button')}</span>
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
        sessionEndsAt={sessionEndsAt}
        onChangeSessionEnd={onChangeSessionEnd}
        hostName={hostName}
        onChangeName={onChangeName}
        onInviteCohost={onInviteCohost}
        onPrintQr={onPrintQr}
        onSendFeedback={onSendFeedback}
      />
    </header>
  );
}
