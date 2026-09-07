import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

const LEAD_IN_BEATS = 4;

export function CountIn({
  secondsLeft,
  totalSeconds,
  onStartNow,
  size,
}: {
  secondsLeft: number;
  totalSeconds: number;
  onStartNow: () => void;
  /** px */
  size?: number;
}): React.ReactElement {
  const { t } = useT();
  // Start at zero so the first second animates in instead of appearing already sung.
  const [live, setLive] = React.useState(false);
  React.useEffect(() => setLive(true), []);

  // The +1 aims each transition at the end of its second, so the sweep lands as the song starts.
  const target = totalSeconds > 0 ? (totalSeconds - secondsLeft + 1) / totalSeconds : 1;
  const sung = live ? Math.min(1, Math.max(0, target)) : 0;
  const lit = Math.min(LEAD_IN_BEATS, secondsLeft);
  const counting = secondsLeft <= LEAD_IN_BEATS;

  return (
    <button
      className={styles.countIn}
      onClick={onStartNow}
      title={t("display.autoStart.now")}
      style={size ? ({ "--cd-size": `${size}px` } as React.CSSProperties) : undefined}
    >
      <span className={`${styles.dots} ${counting ? styles.dotsCounting : ""}`} aria-hidden="true">
        {Array.from({ length: LEAD_IN_BEATS }, (_, i) => (
          <span
            key={i}
            className={`${styles.dot} ${i >= LEAD_IN_BEATS - lit ? styles.dotLit : ""}`}
          />
        ))}
      </span>
      <span className={styles.lyric}>
        <span className={styles.lyricBase}>{t("display.autoStart.lyric")}</span>
        <span
          className={styles.lyricSung}
          aria-hidden="true"
          style={{ clipPath: `inset(0 ${(1 - sung) * 100}% 0 0)` }}
        >
          {t("display.autoStart.lyric")}
        </span>
      </span>
      <span className={styles.seconds} aria-live="off">
        <span key={counting ? secondsLeft : "steady"} className={counting ? styles.beat : undefined}>
          {secondsLeft}
        </span>
      </span>
      <span className={styles.hint}>{t("display.autoStart.now")}</span>
    </button>
  );
}
