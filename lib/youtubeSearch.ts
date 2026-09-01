import { fetchYoutubeApi } from "./youtubeApi";
import { parseIso8601Duration } from "./duration";
import type { SearchResult } from "./searchCache";

/** A call counts once against the 100/day quota whether it returns 8 results or
 *  50, so ask for the maximum — also the videos.list id ceiling. */
export async function searchYoutubeApi(
  q: string,
  duration: string,
  sortBy: string
): Promise<SearchResult[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("No YouTube API key configured");

  const params = new URLSearchParams({
    part: "snippet",
    q,
    videoEmbeddable: "true",
    key,
    type: "video",
    maxResults: "50",
    order: sortBy,
  });
  if (duration !== "any") params.set("videoDuration", duration);

  const data = await fetchYoutubeApi(
    "https://www.googleapis.com/youtube/v3/search?" + params,
    8000
  );

  const results: SearchResult[] =
    data?.items
      ?.filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        title: item.snippet.title ?? "",
        thumbnailUrl:
          item.snippet.thumbnails.medium?.url ||
          item.snippet.thumbnails.default?.url,
        videoId: item.id.videoId,
      })) ?? [];

  return enrichWithVideoDetails(results, key);
}

// 1 unit per 50 ids however many parts, so the badges and the embeddable check
// cost ~1% extra. A video this call doesn't vouch for is dropped here or it
// reaches a player. Any failure of the call itself returns the bare results.
export async function enrichWithVideoDetails(
  results: SearchResult[],
  key: string
): Promise<SearchResult[]> {
  if (results.length === 0) return results;
  try {
    const params = new URLSearchParams({
      part: "contentDetails,statistics,status",
      id: results.map((r) => r.videoId).join(","),
      key,
    });
    const resp = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?" + params,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return results;

    const data = await resp.json();
    const byId = new Map<string, any>(
      (data.items ?? []).map((item: any) => [item.id, item])
    );
    return results
      .map((r) => {
        const item = byId.get(r.videoId);
        // search.list's index lags deletions: an id it named and videos.list did
        // not is gone or private, the 100 a player would report from the room.
        if (!item) return null;
        if (item.status?.embeddable === false) return null;
        return { ...r, ...videoDetailFields(item) };
      })
      .filter((r): r is SearchResult => r !== null);
  } catch {
    return results;
  }
}

/** Absent rather than zero, so the UI's `> 0` badge checks hold. */
export function videoDetailFields(item: any): Partial<SearchResult> {
  const durationSeconds = parseIso8601Duration(item?.contentDetails?.duration ?? "");
  const viewCount = Number(item?.statistics?.viewCount);
  return {
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(Number.isFinite(viewCount) ? { viewCount } : {}),
  };
}
