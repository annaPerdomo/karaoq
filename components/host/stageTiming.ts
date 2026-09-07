import { BURST_SECONDS } from "../../lib/confetti";

/** How long the cheer keeps the spot before Up Next: never before the paper
 * settles, and on a short gap early enough that the next name lands before the count-in ends. */
export const CHEER_HOLD_SECONDS = 6.5;
/** Must match .cheer's fade-out in styles/Countdown.module.css. */
export const CHEER_FADE_SECONDS = 0.5;
const CHEER_MIN_SECONDS = BURST_SECONDS + 0.4;

export function cheerRevealSeconds(gapSeconds: number, counting: boolean): number {
  if (!counting) return CHEER_HOLD_SECONDS;
  return Math.min(CHEER_HOLD_SECONDS, Math.max(CHEER_MIN_SECONDS, gapSeconds * 0.6));
}
