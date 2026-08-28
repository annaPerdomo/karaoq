/**
 * Both windows read `rooms.lastActivity`, which every mutating route bumps and
 * polling, session heartbeats and display beats deliberately don't: an open page
 * beats every 60s whether or not anyone is there, so no window over *that*
 * signal can tell a laptop tab from a room full of people.
 */

/** Ten minutes because 98% of the gaps between consecutive actions in a room are
 *  shorter, so a room mid-session stays badged through a long song. */
export const ADMIN_LIVE_WINDOW_MS = 10 * 60_000;

/** Looser than the badge on purpose: a wrong answer here stutters a live party
 *  mid-song, so the cron waits out a long quiet stretch, not a typical one. */
export const CORPUS_BUSY_WINDOW_MS = 45 * 60_000;
