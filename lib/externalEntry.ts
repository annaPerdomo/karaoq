import type { QueueEntry } from "../pages/api/types";

export function isExternal(entry: Pick<QueueEntry, "external"> | null | undefined): boolean {
  return entry?.external === true;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function autoStartFor(
  entry: Pick<QueueEntry, "external"> | null | undefined,
  autoStartAt: number | null
): number | null {
  return isExternal(entry) ? null : autoStartAt;
}

type Entry = Pick<QueueEntry, "external"> | null | undefined;

export function shouldArmAutoStart(entry: Entry): boolean {
  return !isExternal(entry);
}

export function mayReportEnded(entry: Entry): boolean {
  return !isExternal(entry);
}

export function playerListenerActive(base: boolean, entry: Entry): boolean {
  return base && !isExternal(entry);
}

export function autoArmEnabled(base: boolean, entry: Entry): boolean {
  return base && shouldArmAutoStart(entry);
}
