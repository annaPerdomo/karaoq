import { QueueEntry } from "../pages/api/types";
import { MAX_SONG_SECONDS, MIN_SONG_SECONDS } from "./limits";

// How long the queue will take, honestly approximate. Two things are unknown at
// runtime — how long a song we never got metadata for runs, and how long the
// room takes between singers — so both are modelled explicitly rather than
// pretended away, and every surface labels the result as an estimate.

/** Fallback length for a song we never learned the duration of: a typical
 * karaoke backing track, measured against the ones we do know in the room. */
export const DEFAULT_SONG_SECONDS = 255;

/** Applause, swapping the mic, the host finding the next song, the singer
 * arguing about the key. Deliberately generous — running early reads as a
 * pleasant surprise, running late reads as a broken promise. */
export const CHANGEOVER_SECONDS = 30;

/** Below this an ETA is "any moment now" rather than a number. */
const IMMINENT_SECONDS = 60;

/** A playStartedAt older than this is stale bookkeeping (a room left open
 * overnight), not a song that has genuinely been running for hours. */
const MAX_ELAPSED_SECONDS = 2 * 60 * 60;

export interface QueueSlot {
  id: string;
  /** Index in the full room queue. */
  index: number;
  /** Seconds from now until this entry starts. 0 for whatever is on stage. */
  startsInSeconds: number;
  /** Epoch ms this entry is expected to start. */
  startsAt: number;
  /** Length used for this entry, real or assumed. */
  songSeconds: number;
  /** False when songSeconds was assumed rather than known. */
  knownLength: boolean;
}

export interface QueueEstimate {
  /** One slot per entry from the active index onward, in running order. */
  slots: QueueSlot[];
  /** Seconds until the last queued song finishes. 0 when nothing is queued. */
  totalSeconds: number;
  /** Epoch ms the queue is expected to run dry. */
  endsAt: number;
  /** Length the estimate assumes for songs of unknown length. */
  assumedSongSeconds: number;
  /** True when at least one slot leaned on the assumed length. */
  approximate: boolean;
}

export interface QueueEstimateInput {
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
  /** The room's playStartedAt — lets the on-stage song count down instead of
   * restarting the whole estimate on every poll. */
  playStartedAt?: string | Date | null;
  now?: number;
}

function plausible(seconds: number | undefined): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds >= MIN_SONG_SECONDS &&
    seconds <= MAX_SONG_SECONDS
  );
}

/** What to assume for songs of unknown length: this room's own average, since a
 * room full of 7-minute power ballads is nothing like one full of 2-minute
 * pop. Falls back to the global default until the room has any known song. */
export function assumedSongSeconds(queue: QueueEntry[]): number {
  const known = queue
    .map((entry) => entry.durationSeconds)
    .filter(plausible) as number[];
  if (known.length === 0) return DEFAULT_SONG_SECONDS;
  const mean = known.reduce((sum, s) => sum + s, 0) / known.length;
  return Math.round(mean);
}

function elapsedSeconds(
  playStartedAt: string | Date | null | undefined,
  now: number
): number | null {
  if (!playStartedAt) return null;
  const started = new Date(playStartedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = (now - started) / 1000;
  if (elapsed < 0 || elapsed > MAX_ELAPSED_SECONDS) return null;
  return elapsed;
}

/**
 * Running order with a clock against it. Slot 0 is the song on stage (or the
 * one cued up while stopped); every later slot starts when the one before it
 * ends, plus a changeover.
 */
export function estimateQueue({
  queue,
  activeVideoIndex,
  isPlaying,
  playStartedAt,
  now = Date.now(),
}: QueueEstimateInput): QueueEstimate {
  const assumed = assumedSongSeconds(queue);
  const upcoming = queue.slice(Math.max(0, activeVideoIndex));

  const slots: QueueSlot[] = [];
  let cursor = 0;
  let approximate = false;

  upcoming.forEach((entry, i) => {
    const knownLength = plausible(entry.durationSeconds);
    const songSeconds = knownLength ? entry.durationSeconds! : assumed;
    if (!knownLength) approximate = true;

    slots.push({
      id: entry.id,
      index: Math.max(0, activeVideoIndex) + i,
      startsInSeconds: cursor,
      startsAt: now + cursor * 1000,
      songSeconds,
      knownLength,
    });

    // Only the song actually on stage has already burned time; a stopped room
    // is treated as about to start, which is what the host is looking at.
    const played =
      i === 0 && isPlaying ? (elapsedSeconds(playStartedAt, now) ?? 0) : 0;
    cursor += Math.max(0, songSeconds - played) + CHANGEOVER_SECONDS;
  });

  // The trailing changeover isn't waited out by anybody — the last song ending
  // is the end of the queue.
  const totalSeconds = slots.length > 0 ? Math.max(0, cursor - CHANGEOVER_SECONDS) : 0;

  return {
    slots,
    totalSeconds,
    endsAt: now + totalSeconds * 1000,
    assumedSongSeconds: assumed,
    approximate,
  };
}

/**
 * This song is expected to still be running when the room's time is up. Every
 * surface flags it rather than hiding it — cutting it is the host's call.
 */
export function runsPastEnd(
  slot: QueueSlot | null,
  sessionEndsAt: number | null
): boolean {
  if (!slot || sessionEndsAt === null) return false;
  return slot.startsAt + slot.songSeconds * 1000 > sessionEndsAt;
}

/** Slot for a specific entry, or null when it isn't upcoming (already sung). */
export function slotFor(
  estimate: QueueEstimate,
  entryId: string
): QueueSlot | null {
  return estimate.slots.find((s) => s.id === entryId) ?? null;
}

/**
 * How many more average-length songs fit in `secondsLeft`. What a host needs to
 * answer "can we still take requests?" — the question that gets asked in every
 * booked private room ten minutes before the hour.
 */
export function songsThatFit(
  secondsLeft: number,
  songSeconds: number
): number {
  if (secondsLeft <= 0) return 0;
  const perSong = Math.max(1, songSeconds + CHANGEOVER_SECONDS);
  // The last song needs no changeover after it, so give that time back.
  return Math.max(0, Math.floor((secondsLeft + CHANGEOVER_SECONDS) / perSong));
}

/**
 * Presentation rounding: precise up close, deliberately coarse further out.
 * "in 37 min" claims accuracy this estimate does not have; "~35 min" doesn't.
 */
export function roundEtaSeconds(seconds: number): number {
  if (seconds < IMMINENT_SECONDS) return 0;
  const minutes = seconds / 60;
  if (minutes < 10) return Math.round(minutes) * 60;
  if (minutes < 60) return Math.round(minutes / 5) * 5 * 60;
  return Math.round(minutes / 10) * 10 * 60;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * "<1 min" / "25 min" / "1 hr 20 min". Rounded per roundEtaSeconds — callers
 * add the "~" through their own copy so a locale can place it correctly.
 */
export function formatApproxDuration(seconds: number, t: Translate): string {
  const rounded = roundEtaSeconds(Math.max(0, seconds));
  if (rounded <= 0) return t("time.lessThanMinute");
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  if (hours > 0 && minutes > 0) return t("time.hoursMinutes", { hours, minutes });
  if (hours > 0) return t("time.hours", { count: hours });
  return t("time.minutes", { count: minutes });
}

/**
 * "23:30" from a time input → the next epoch ms that reads as that clock time.
 * A time already past today rolls to tomorrow, so a host closing at 1 AM sets
 * 01:00 at midnight and gets tonight's 1 AM, not this morning's. Returns null
 * for anything that isn't HH:MM.
 */
export function clockTimeToEpoch(
  value: string,
  now: number = Date.now()
): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  // Small backwards slips are the host correcting an overrun, not a next-day slot.
  if (at.getTime() < now - 15 * 60 * 1000) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** Epoch ms → the "HH:MM" a <input type="time"> wants, in local time. */
export function epochToClockInput(epochMs: number): string {
  const at = new Date(epochMs);
  return `${String(at.getHours()).padStart(2, "0")}:${String(
    at.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Per-song label: "in ~12 min", or "up next" once a number stops being useful.
 * Callers handle the song actually on stage themselves — only they know it.
 */
export function etaLabel(startsInSeconds: number, t: Translate): string {
  return startsInSeconds < IMMINENT_SECONDS
    ? t("queue.eta.upNext")
    : t("queue.eta.in", { time: formatApproxDuration(startsInSeconds, t) });
}

/** Wall-clock "9:45 PM" in the viewer's locale, for "we finish around…". */
export function formatClockTime(epochMs: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(epochMs));
  } catch {
    const d = new Date(epochMs);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}
