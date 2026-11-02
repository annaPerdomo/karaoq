import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { AutoAdvance } from "../../pages/api/types";
import { AutoAdvanceSetting } from "./AutoAdvanceSetting";

export function PlaybackModeSheet({
  isOpen,
  onClose,
  autoAdvance,
  onChangeAutoAdvance,
  songLimit,
  onChangeSongLimit,
}: {
  isOpen: boolean;
  onClose: () => void;
  autoAdvance: AutoAdvance;
  onChangeAutoAdvance: (patch: Partial<AutoAdvance>) => void;
  songLimit?: number | null;
  onChangeSongLimit?: (seconds: number | null) => void;
}): React.ReactElement | null {
  const { t } = useT();

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("host.settings.playback")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetHandle} />
        <AutoAdvanceSetting
          autoAdvance={autoAdvance}
          onChange={onChangeAutoAdvance}
          songLimit={songLimit}
          onChangeSongLimit={onChangeSongLimit}
        />
        <button className={styles.sheetDone} onClick={onClose} autoFocus>
          {t("host.transport.modeDone")}
        </button>
      </div>
    </div>
  );
}
