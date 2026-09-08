import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { formatGap } from "../../lib/duration";
import { CountdownRing } from "../player/CountdownRing";
import { StageScene } from "../player/StageScene";
import { CHEER_FADE_SECONDS, cheerRevealSeconds } from "./stageTiming";
import { calmMotion, isTvDevice } from "../../lib/calmMotion";

/** Keyed by the song count, not random, so every host screen shows the same cheer. */
const CHEER_COUNT = 24;
const CHEER_KEYS = Array.from({ length: CHEER_COUNT }, (_, i) =>
  i === 0 ? "host.autoStart.cheer" : `host.autoStart.cheer${i + 1}`
);

export function AutoStartPanel({
  secondsLeft,
  gapSeconds,
  autoEnabled,
  showCheer,
  songsSung,
  lastSinger,
  singerName,
  songTitle,
  onOpenSettings,
}: {
  /** null = no countdown running. */
  secondsLeft: number | null;
  gapSeconds: number;
  autoEnabled: boolean;
  showCheer: boolean;
  songsSung: number;
  lastSinger: string;
  singerName: string;
  songTitle: string;
  onOpenSettings?: () => void;
}): React.ReactElement {
  const { t } = useT();
  const cheer = CHEER_KEYS[Math.max(0, songsSung - 1) % CHEER_KEYS.length];
  const reveal = showCheer ? cheerRevealSeconds(gapSeconds, secondsLeft !== null) : 0.2;
  // A timer, not only the CSS fade: a TV runs no animations, so a cheer left to
  // fade itself out would sit on Up Next until the song started.
  const [handedOver, setHandedOver] = React.useState(!showCheer);
  // A ref, never a dependency: the gap is live behind this panel's own pill, and
  // as a dep a mid-countdown change would replay a cheer that already finished.
  const revealRef = React.useRef(reveal);
  revealRef.current = reveal;
  React.useEffect(() => {
    if (!showCheer) {
      setHandedOver(true);
      return;
    }
    setHandedOver(false);
    const holdMs = (revealRef.current + (calmMotion() ? 0 : CHEER_FADE_SECONDS)) * 1000;
    const timer = setTimeout(() => setHandedOver(true), holdMs);
    return () => clearTimeout(timer);
  }, [showCheer, cheer]);
  const cheering = showCheer && !handedOver;
  // A TV compositor keeps the cheer's pixels after the node goes; dirtying the
  // stage layer for a frame forces the repaint. Belt to the CSS braces.
  const stageRef = React.useRef<HTMLDivElement>(null);
  const wasCheeringRef = React.useRef(false);
  React.useEffect(() => {
    const el = stageRef.current;
    const wasCheering = wasCheeringRef.current;
    wasCheeringRef.current = cheering;
    if (cheering || !wasCheering || !el || !isTvDevice()) return;
    el.style.opacity = "0.999";
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.opacity = "";
      })
    );
    return () => {
      cancelAnimationFrame(frame);
      el.style.opacity = "";
    };
  }, [cheering]);
  // The pill sits with the clock, not Up Next: it must be reachable while the
  // cheer still holds the spot, or nobody could stop the chain.
  const showPill = !!onOpenSettings && autoEnabled;
  const showCount = secondsLeft !== null || showPill;
  return (
    <>
      <StageScene celebrate={showCheer} />
      <div className={styles.panel}>
        <div
          ref={stageRef}
          className={`${styles.stageMain} ${showCount ? styles.stageMainCounting : ""}`}
          style={
            {
              "--reveal": `${reveal}s`,
            } as React.CSSProperties
          }
        >
          <div
            className={`${styles.spot} ${showCheer ? "" : styles.spotStill}`}
            aria-hidden="true"
          />
          {cheering && (
            <h2 key={cheer} className={styles.cheer}>
              {t(cheer, { name: lastSinger })}
            </h2>
          )}
          {!cheering && (
            <div className={styles.stack}>
              <div className={styles.upNext}>
                <span className={styles.upNextLabel}>
                  {t("host.status.upNext")}
                </span>
                <span className={styles.upNextSinger}>{singerName}</span>
                <span className={styles.upNextSong}>{songTitle}</span>
              </div>
            </div>
          )}
          {showCount && (
            <div className={styles.stageCount}>
              {secondsLeft !== null && (
                <>
                  <p className={styles.caption}>{t("host.autoStart.startsIn")}</p>
                  <CountdownRing secondsLeft={secondsLeft} totalSeconds={gapSeconds} />
                </>
              )}
              {showPill && (
                <button
                  className={styles.modePill}
                  onClick={onOpenSettings}
                  aria-haspopup="dialog"
                  title={t("host.settings.playback")}
                >
                  {t("host.settings.autoAdvance")}
                  <span className={styles.modePillGap}>
                    {t("host.transport.modeAutoGap", {
                      gap: formatGap(gapSeconds, t),
                    })}
                  </span>
                  <span className={styles.modePillCaret} aria-hidden="true">
                    ▾
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
