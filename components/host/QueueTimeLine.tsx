import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import {
  QueueEstimate,
  formatApproxDuration,
  formatClockTime,
  songsThatFit,
} from "../../lib/queueTime";

/** How long the queue will take, when it lands, and — when the room has a
 * wrap-up time — whether it still fits inside it. */
export function QueueTimeLine({
  estimate,
  sessionEndsAt,
}: {
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
}): React.ReactElement | null {
  const { t, tn, locale } = useT();
  if (estimate.slots.length === 0) return null;

  // Measured from when the queue runs dry, not from now: what's already queued
  // runs first. Both branches read this one number, so the bar can't offer room
  // in a queue it knows runs long.
  const spareSeconds =
    sessionEndsAt === null ? 0 : (sessionEndsAt - estimate.endsAt) / 1000;
  const overrunning = sessionEndsAt !== null && spareSeconds < 0;

  return (
    <div
      className={`${styles.queueEndRow} ${overrunning ? styles.queueEndRowWarn : ""}`}
      title={t("queue.eta.note")}
    >
      <span className={styles.queueTimeLeft}>
        {t("host.stats.timeLeft", {
          time: formatApproxDuration(estimate.totalSeconds, t),
        })}
      </span>
      <span className={styles.statDot} />
      {sessionEndsAt === null ? (
        <span>
          {t("host.time.endsAround", {
            time: formatClockTime(estimate.endsAt, locale),
          })}
        </span>
      ) : (
        <>
          <span>
            {t("host.time.untilEnd", {
              time: formatClockTime(sessionEndsAt, locale),
            })}
          </span>
          <span className={styles.statDot} />
          <span>
            {overrunning
              ? t("host.time.overBy", {
                  over: formatApproxDuration(-spareSeconds, t),
                })
              : tn(
                  "host.time.fitsMore",
                  songsThatFit(spareSeconds, estimate.assumedSongSeconds)
                )}
          </span>
        </>
      )}
    </div>
  );
}
