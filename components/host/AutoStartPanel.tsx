import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { formatGap } from "../../lib/duration";
import { CountdownRing } from "../player/CountdownRing";
import { StageScene } from "../player/StageScene";
import { cheerRevealSeconds } from "./stageTiming";

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
  // The pill sits with the clock, not Up Next: it must be reachable while the
  // cheer still holds the spot, or nobody could stop the chain.
  const showPill = !!onOpenSettings && autoEnabled;
  const showCount = secondsLeft !== null || showPill;
  return (
    <>
      <StageScene celebrate={showCheer} />
      <div className={styles.panel}>
        <div
          className={`${styles.stageMain} ${showCount ? styles.stageMainCounting : ""}`}
          style={
            {
              "--reveal": showCheer
                ? `${cheerRevealSeconds(gapSeconds, secondsLeft !== null)}s`
                : "0.2s",
            } as React.CSSProperties
          }
        >
          <div
            className={`${styles.spot} ${showCheer ? "" : styles.spotStill}`}
            aria-hidden="true"
          />
          {showCheer && (
            <h2 key={cheer} className={styles.cheer}>
              {t(cheer, { name: lastSinger })}
            </h2>
          )}
          <div className={styles.stack}>
            <div className={styles.upNext}>
              <span className={styles.upNextLabel}>
                {t("host.status.upNext")}
              </span>
              <span className={styles.upNextSinger}>{singerName}</span>
              <span className={styles.upNextSong}>{songTitle}</span>
            </div>
          </div>
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
