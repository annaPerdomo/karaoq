import { SearchResult } from "./searchCache";
import { YoutubeApiError } from "./youtubeApi";
import { searchYoutubeApi } from "./youtubeSearch";

// Per-instance, but Fluid Compute routes concurrent requests into one instance —
// exactly the window in which two singers tapping one song burned two searches.
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// YouTube bills no quota for the call it refused, so a burst retry costs the
// wait and nothing else. A spent day is never retried: it cannot clear before
// the Pacific reset.
const BURST_RETRY_MS = 700;

export async function searchWithBurstRetry(
  q: string,
  duration: string,
  sortBy: string
): Promise<SearchResult[]> {
  try {
    return await searchYoutubeApi(q, duration, sortBy);
  } catch (e: any) {
    if (!(e instanceof YoutubeApiError) || e.limit !== "burst") throw e;
    await new Promise((resolve) => setTimeout(resolve, BURST_RETRY_MS));
    return searchYoutubeApi(q, duration, sortBy);
  }
}

export function getInFlightSearch(key: string): Promise<SearchResult[]> | undefined {
  return inFlightSearches.get(key);
}

export function setInFlightSearch(key: string, promise: Promise<SearchResult[]>): void {
  inFlightSearches.set(key, promise);
}

// A follower whose leader failed starts a fresh search under the same key;
// the leader's cleanup must not delete it.
export function clearInFlightSearch(key: string, promise: Promise<SearchResult[]>): void {
  if (inFlightSearches.get(key) === promise) inFlightSearches.delete(key);
}
