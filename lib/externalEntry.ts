import type { QueueEntry } from "../pages/api/types";

export function isExternal(entry: Pick<QueueEntry, "external"> | null | undefined): boolean {
  return entry?.external === true;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
