import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";

// The room's "set once" controls: audience reactions, the co-host invite, and
// the host's name. Playback mode lives in the header pill, and inviting singers
// lives in the Invite panel.
export function SettingsPopover({
  isOpen,
  onClose,
  remote,
  reactionsOn,
  onToggleReactions,
  boardsOnDisplay,
  onToggleBoardsOnDisplay,
  hostName,
  onChangeName,
  onInviteCohost,
  onOpenDisplayPanel,
}: {
  isOpen: boolean;
  onClose: () => void;
  remote: boolean;
  reactionsOn: boolean;
  onToggleReactions: () => void;
  boardsOnDisplay: boolean;
  onToggleBoardsOnDisplay: () => void;
  hostName: string;
  onChangeName: () => void;
  onInviteCohost: () => void;
  onOpenDisplayPanel: () => void;
}) {
  const { t } = useT();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !(e.target as Element).closest(`.${styles.gearBtn}`)
      ) {
        onClose();
      }
    };
    const t = setTimeout(
      () => document.addEventListener("pointerdown", handler),
      10,
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={ref} className={styles.settingsPopover}>
      {!remote && (
        <>
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>{t('host.settings.audience')}</div>
            <button className={styles.spToggleRow} onClick={onToggleReactions}>
              <div>
                <div className={styles.spBtnTitle}>{t('host.settings.reactions')}</div>
                <div className={styles.spBtnDesc}>
                  {reactionsOn
                    ? t('host.settings.reactionsOn')
                    : t('host.settings.reactionsOff')}
                </div>
              </div>
              <div
                className={`${styles.toggle} ${reactionsOn ? styles.toggleOn : ""}`}
              >
                <div className={styles.toggleThumb} />
              </div>
            </button>
            <button className={styles.spToggleRow} onClick={onToggleBoardsOnDisplay}>
              <div>
                <div className={styles.spBtnTitle}>{t('host.settings.boards')}</div>
                <div className={styles.spBtnDesc}>
                  {boardsOnDisplay
                    ? t('host.settings.boardsOn')
                    : t('host.settings.boardsOff')}
                </div>
              </div>
              <div
                className={`${styles.toggle} ${boardsOnDisplay ? styles.toggleOn : ""}`}
              >
                <div className={styles.toggleThumb} />
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
          <div className={styles.spGroup}>
            <button className={styles.spBtn} onClick={onOpenDisplayPanel}>
              {Icons.tv}
              <div>
                <div className={styles.spBtnTitle}>{t('host.settings.display')}</div>
                <div className={styles.spBtnDesc}>
                  {t('host.settings.displayDesc')}
                </div>
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>{t('host.settings.cohosts')}</div>
            <button className={styles.spBtn} onClick={onInviteCohost}>
              {Icons.users}
              <div>
                <div className={styles.spBtnTitle}>{t('host.cohost.title')}</div>
                <div className={styles.spBtnDesc}>
                  {t('host.cohost.short')}
                </div>
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
        </>
      )}
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>{remote ? t('host.role.cohost') : t('host.role.host')}</div>
        <button className={styles.spBtn} onClick={onChangeName}>
          {Icons.edit}
          <div>
            <div className={styles.spBtnTitle}>{hostName}</div>
            <div className={styles.spBtnDesc}>{t('host.settings.changeName')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
