import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { formatDuration } from "../../lib/duration";

const LEAD_IN_BEATS = 4;
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({
  secondsLeft,
  totalSeconds,
  size,
}: {
  secondsLeft: number;
  totalSeconds: number;
  /** px; leave unset to let the stylesheet size the ring per breakpoint. */
  size?: number;
}): React.ReactElement {
  const { t } = useT();
  // Start empty so the first second animates in.
  const [live, setLive] = React.useState(false);
  React.useEffect(() => setLive(true), []);

  // +1 aims each transition at the end of its second so the ring closes as the song starts.
  const target = totalSeconds > 0 ? (totalSeconds - secondsLeft + 1) / totalSeconds : 1;
  const sung = live ? Math.min(1, Math.max(0, target)) : 0;
  const counting = secondsLeft <= LEAD_IN_BEATS;
  const underMinute = secondsLeft < 60;
  const label = underMinute ? String(secondsLeft).padStart(2, "0") : formatDuration(secondsLeft);

  return (
    <div
      className={`${styles.ring} ${counting ? styles.ringCounting : ""}`}
      style={size === undefined ? undefined : ({ "--ring-size": `${size}px` } as React.CSSProperties)}
      role="timer"
      aria-live="off"
    >
      <svg className={styles.ringSvg} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="countdownRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--cd-b, #00f0ff)" />
            <stop offset="1" stopColor="var(--cd-a, #ff2d78)" />
          </linearGradient>
        </defs>
        <circle className={styles.ringTrack} cx="50" cy="50" r={RADIUS} />
        <circle
          className={styles.ringFill}
          cx="50"
          cy="50"
          r={RADIUS}
          stroke="url(#countdownRingGrad)"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - sung)}
        />
      </svg>
      <div className={styles.ringFace}>
        <span className={`${styles.ringNum} ${underMinute ? "" : styles.ringNumLong}`}>
          <span key={counting ? secondsLeft : "steady"} className={counting ? styles.beat : undefined}>
            {label}
          </span>
        </span>
        {underMinute && <span className={styles.ringUnit}>{t("host.autoStart.seconds")}</span>}
      </div>
    </div>
  );
}
