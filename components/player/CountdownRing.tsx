import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The between-songs breather: a ring draining over the gap. A tap starts now. */
export function CountdownRing({
  secondsLeft,
  totalSeconds,
  onStartNow,
  size,
}: {
  secondsLeft: number;
  totalSeconds: number;
  onStartNow: () => void;
  /** Pixel size of the dial; the display goes big, the host stage smaller. */
  size?: number;
}): React.ReactElement {
  const { t } = useT();
  const fraction = totalSeconds > 0 ? Math.min(1, secondsLeft / totalSeconds) : 0;
  return (
    <button
      className={styles.ring}
      onClick={onStartNow}
      title={t("display.autoStart.now")}
      style={size ? ({ "--ring-size": `${size}px` } as React.CSSProperties) : undefined}
    >
      <span className={styles.dial}>
        <svg viewBox="0 0 108 108" aria-hidden="true">
          <circle className={styles.track} cx="54" cy="54" r={RADIUS} />
          <circle
            className={styles.fill}
            cx="54"
            cy="54"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <span className={styles.seconds}>{secondsLeft}</span>
      </span>
      <span className={styles.caption}>{t("display.autoStart.caption")}</span>
      <span className={styles.hint}>{t("display.autoStart.now")}</span>
    </button>
  );
}
