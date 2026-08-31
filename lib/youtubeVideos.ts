import type { SearchResult } from "./searchCache";
import { videoDetailFields } from "./youtubeSearch";

/** videos.list takes up to 50 ids per call — 1 unit out of the 10,000/day pool,
 *  a different pool from the 100 search.list calls a day. */
export const ID_BATCH = 50;

export interface VideoRows {
  rows: Map<string, SearchResult>;
  /** Not the ids YouTube left unanswered: these the owner blocked, so callers
   *  tombstone them. */
  unembeddable: string[];
}

/** Null when the call failed; empty rows when YouTube answered and none of the
 *  videos exist. Collapsed, one 403 read as every video being gone. */
export async function fetchVideoRows(
  videoIds: string[],
  key: string
): Promise<VideoRows | null> {
  const rows = new Map<string, SearchResult>();
  const unembeddable: string[] = [];
  if (videoIds.length === 0) return { rows, unembeddable };
  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics,status",
    id: videoIds.slice(0, ID_BATCH).join(","),
    key,
  });
  let resp: Response;
  try {
    resp = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // A timeout is the same "couldn't ask" as a 5xx, and must not abort the run.
    return null;
  }
  if (!resp.ok) return null;
  const data = await resp.json();
  for (const item of data.items ?? []) {
    // Unembeddable can't play in the room, so it's as good as deleted.
    if (item?.status?.embeddable === false) {
      if (item.id) unembeddable.push(item.id);
      continue;
    }
    const snippet = item?.snippet;
    if (!snippet || !item.id) continue;
    rows.set(item.id, {
      title: snippet.title ?? "",
      thumbnailUrl:
        snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
      videoId: item.id,
      ...videoDetailFields(item),
    });
  }
  return { rows, unembeddable };
}
