import { QueueEntry } from '../pages/api/types';
import { singerKey, singerKeys } from './fairQueue';

export interface NightRecap {
  songs: number;
  singers: number;
  star?: string;
}

export const NIGHT_WINDOW_MS = 12 * 60 * 60 * 1000;

export function buildNightRecap(
  queue: QueueEntry[],
  activeVideoIndex: number,
  now: number
): NightRecap {
  const hasCurrent = activeVideoIndex >= 0 && activeVideoIndex < queue.length;
  const played = queue.filter((entry, index) => {
    const isPlayedPosition = index < activeVideoIndex || (hasCurrent && index === activeVideoIndex);
    if (!isPlayedPosition) return false;
    return typeof entry.addedAt === 'number' && now - entry.addedAt < NIGHT_WINDOW_MS;
  });

  const counts = new Map<string, number>();
  played.forEach((entry) => {
    singerKeys(entry.userName).forEach((key) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  let topKey: string | undefined;
  let topCount = 0;
  let tied = false;
  counts.forEach((count, key) => {
    if (count > topCount) {
      topCount = count;
      topKey = key;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  });

  // A duet's folded key has no single original-case name, so only a solo credit can be the star.
  let star: string | undefined;
  if (topKey && topCount >= 2 && !tied) {
    const match = played.find((entry) => singerKey(entry.userName.trim()) === topKey);
    if (match) star = match.userName.trim();
  }

  return { songs: played.length, singers: counts.size, star };
}
