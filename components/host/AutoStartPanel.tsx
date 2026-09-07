import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { AUTO_ADVANCE_GAPS } from "../../pages/api/types";
import { CountIn } from "../player/CountIn";

/** A gap change re-times the running countdown server-side, so the count-in follows. */
export function AutoStartPanel({
  secondsLeft,
  gapSeconds,
  onStartNow,
  onChangeGap,
  onTurnOff,
}: {
  secondsLeft: number;
  gapSeconds: number;
  onStartNow: () => void;
  onChangeGap: (gapSeconds: number) => void;
  onTurnOff: () => void;
}): React.ReactElement {
  const { t } = useT();
  return (
    <div className={styles.panel}>
      <CountIn
        secondsLeft={secondsLeft}
        totalSeconds={gapSeconds}
        onStartNow={onStartNow}
        size={14}
      />
      <div className={styles.controls}>
        <div className={styles.chips} role="group" aria-label={t("host.settings.autoGap")}>
          {AUTO_ADVANCE_GAPS.map((gap) => (
            <button
              key={gap}
              className={`${styles.chip} ${gap === gapSeconds ? styles.chipOn : ""}`}
              onClick={() => onChangeGap(gap)}
              aria-pressed={gap === gapSeconds}
            >
              {t("host.settings.seconds", { n: gap })}
            </button>
          ))}
        </div>
        <button className={styles.off} onClick={onTurnOff}>
          {t("host.autoStart.turnOff")}
        </button>
      </div>
    </div>
  );
}
