import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import formatSongTitle from '../../lib/songTitle';
import { QueueEntry } from '../../pages/api/types';
import { singerKeys, singerKey } from '../../lib/fairQueue';
import {
  CHANGEOVER_SECONDS,
  QueueEstimate,
  formatApproxDuration,
  formatClockTime,
  runsPastEnd,
  slotFor,
} from '../../lib/queueTime';
import { useT } from '../../lib/i18n/I18nProvider';

export interface MyTurn {
  entry: QueueEntry;
  /** Seconds until they're on. 0 once they're the one singing. */
  secondsAway: number;
  onStage: boolean;
  /** Close enough that a number reads as false precision. */
  imminent: boolean;
  /** Their song is expected to still be running when the room's time is up. */
  afterEnd: boolean;
  /** Songs between now and theirs. */
  songsAhead: number;
}

/**
 * Where the viewer sits in the running order, if they're in it at all. Shared
 * by the card and the mobile drawer handle so the two can never disagree.
 */
export function myTurnState(
  upcoming: QueueEntry[],
  userName: string,
  estimate: QueueEstimate,
  isPlaying: boolean,
  sessionEndsAt: number | null
): MyTurn | null {
  const name = userName.trim();
  if (!name) return null;
  const mine = singerKey(name);
  const entry = upcoming.find((e) => singerKeys(e.userName).includes(mine));
  if (!entry) return null;

  const slot = slotFor(estimate, entry.id);
  const secondsAway = slot?.startsInSeconds ?? 0;
  const ahead = estimate.slots.findIndex((s) => s.id === entry.id);
  const onStage = isPlaying && upcoming[0]?.id === entry.id;

  return {
    entry,
    secondsAway,
    onStage,
    imminent: !onStage && secondsAway < 60,
    afterEnd: runsPastEnd(slot, sessionEndsAt),
    // The song on stage isn't "ahead" of anyone — it's already happening.
    songsAhead: Math.max(0, ahead - (isPlaying ? 1 : 0)),
  };
}

/**
 * "You're up in ~12 min" — the one thing a singer actually wants from a queue
 * they can't reorder. With nothing queued it answers the other half of the
 * question: how long the wait would be if they added something now.
 */
const YourTurnCard = ({
  upcoming,
  userName,
  estimate,
  sessionEndsAt,
  isPlaying,
}: {
  /** queue.slice(activeVideoIndex) — the song on stage first. */
  upcoming: QueueEntry[];
  userName: string;
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  isPlaying: boolean;
}): React.ReactElement | null => {
  const { t, tn, locale } = useT();
  const mine = myTurnState(upcoming, userName, estimate, isPlaying, sessionEndsAt);

  if (!mine) {
    // Nothing of theirs queued: what adding one right now would cost them.
    if (estimate.slots.length === 0 || !userName.trim()) return null;
    return (
      <div className={styles.turnCard}>
        <span className={styles.turnLead}>
          {t('sing.eta.ifYouAdd', {
            time: formatApproxDuration(
              estimate.totalSeconds + CHANGEOVER_SECONDS,
              t
            ),
          })}
        </span>
        {sessionEndsAt !== null &&
          estimate.endsAt + CHANGEOVER_SECONDS * 1000 > sessionEndsAt && (
            <span className={styles.turnWarn}>{t('sing.eta.mayNotFit')}</span>
          )}
      </div>
    );
  }

  return (
    <div className={`${styles.turnCard} ${mine.onStage ? styles.turnCardNow : ''}`}>
      <span className={styles.turnLead}>
        {mine.onStage
          ? t('sing.eta.yourTurnNow')
          : mine.imminent
            ? t('sing.eta.yourTurnNext')
            : t('sing.eta.yourTurn', {
                time: formatApproxDuration(mine.secondsAway, t),
              })}
      </span>
      <span className={styles.turnSong}>
        {formatSongTitle(mine.entry.songTitle)}
      </span>
      {!mine.onStage && mine.songsAhead > 0 && (
        <span className={styles.turnAhead}>
          {tn('sing.eta.ahead', mine.songsAhead)}
        </span>
      )}
      {mine.afterEnd && (
        <span className={styles.turnWarn}>
          {t('sing.eta.yoursMayNotFit', {
            time: formatClockTime(sessionEndsAt!, locale),
          })}
        </span>
      )}
    </div>
  );
};

export default YourTurnCard;
