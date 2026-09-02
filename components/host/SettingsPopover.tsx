import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { SessionEndSetting } from "./SessionEndSetting";

export function SettingsPopover({
  isOpen,
  onClose,
  remote,
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
}: {
  isOpen: boolean;
  onClose: () => void;
  remote: boolean;
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
          </div>
          <div className={styles.spSep} />
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>{t('host.settings.queue')}</div>
            <button className={styles.spToggleRow} onClick={onToggleFairMode}>
              <div>
                <div className={styles.spBtnTitle}>{t('host.settings.fair')}</div>
                <div className={styles.spBtnDesc}>
                  {fairMode
                    ? t('host.settings.fairOn')
                    : t('host.settings.fairOff')}
                </div>
              </div>
              <div
                className={`${styles.toggle} ${fairMode ? styles.toggleOn : ""}`}
              >
                <div className={styles.toggleThumb} />
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
          <SessionEndSetting
            sessionEndsAt={sessionEndsAt}
            onChange={onChangeSessionEnd}
          />
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
          {/* Duplicated from the QR modal on purpose: that modal only opens
              from the Scan to join shelf, which Customize can switch off. */}
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>{t('host.settings.invite')}</div>
            <button className={styles.spBtn} onClick={onPrintQr}>
              {Icons.printer}
              <div>
                <div className={styles.spBtnTitle}>{t('host.qr.printCode')}</div>
                <div className={styles.spBtnDesc}>{t('host.qr.printDesc')}</div>
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
      <div className={styles.spSep} />
      {/* Outside the !remote block on purpose — a cohost hits the same bugs. */}
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>{t('feedback.settingsGroup')}</div>
        <button className={styles.spBtn} onClick={onSendFeedback}>
          {Icons.megaphone}
          <div>
            <div className={styles.spBtnTitle}>{t('feedback.host.title')}</div>
            <div className={styles.spBtnDesc}>{t('feedback.host.desc')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
