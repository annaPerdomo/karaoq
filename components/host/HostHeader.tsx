import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import LanguageSwitcher from "../LanguageSwitcher";
import { Icons } from "./icons";
import { SettingsPopover } from "./SettingsPopover";
import ClubLogo from "../brand/ClubLogo";
import { CornerHandle } from "../edit/EditChrome";
import { useScalarDrag } from "../edit/hooks/useScalarDrag";
import { roundLogoScale } from "../../lib/brandStyle";
import { LOGO_SCALE_MAX, LOGO_SCALE_MIN } from "../../lib/limits";

export function HostHeader({
  roomId,
  logo,
  logoScale,
  onLogoScaleChange,
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
  onOpenMusicVideo,
  onCopyMusicVideoLink,
  onBrandClick,
}: {
  roomId: string;
  logo: string | undefined;
  logoScale: number;
  onLogoScaleChange: (scale: number) => void;
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
  onOpenMusicVideo: () => void;
  onCopyMusicVideoLink: () => void;
  onBrandClick: () => void;
}) {
  const { t } = useT();
  const logoDrag = useScalarDrag({
    value: logoScale,
    min: LOGO_SCALE_MIN,
    max: LOGO_SCALE_MAX,
    scale: 80,
    step: 0.1,
    round: roundLogoScale,
    onChange: onLogoScaleChange,
  });
  return (
    <header className={styles.header}>
      <span className={styles.logoWrap}>
        <ClubLogo roomId={roomId} logo={logo} className={styles.clubLogo} dividerClassName={styles.clubDivider} />
        {customizing && logo && (
          <CornerHandle
            title={t('customize.dragResize')}
            ariaLabel={t('edit.handle.logoSize')}
            dragProps={logoDrag}
          />
        )}
      </span>
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
        onOpenMusicVideo={onOpenMusicVideo}
        onCopyMusicVideoLink={onCopyMusicVideoLink}
      />
    </header>
  );
}
