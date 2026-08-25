/** Which allowance turned the call away. YouTube reports both as a quota
 *  error, but they are a day apart in consequence: `daily` is gone until the
 *  midnight Pacific reset, while `burst` is a short-window ceiling that clears
 *  in seconds — one room hammering search trips it with the day's allowance
 *  barely touched. Telling those apart is what keeps a busy minute in one room
 *  from announcing an outage to every other room until midnight. */
export type YoutubeLimit = "daily" | "burst";

/** A YouTube API failure, flagged when the cause is a spent quota so callers
 * can say when search comes back rather than "try again shortly". */
export class YoutubeApiError extends Error {
  /** Null when the failure was not a limit at all — a bad key, an outage. */
  limit: YoutubeLimit | null;
  /** Either limit degrades a caller the same way (stale cache, then corpus).
   *  Only `limit === "daily"` may tell a room search is gone for the day. */
  quotaExceeded: boolean;
  constructor(message: string, limit: YoutubeLimit | null) {
    super(message);
    this.name = "YoutubeApiError";
    this.limit = limit;
    this.quotaExceeded = limit !== null;
  }
}

const DAILY_REASONS = ["quotaExceeded", "dailyLimitExceeded"];
const BURST_REASONS = ["rateLimitExceeded", "userRateLimitExceeded"];

function limitFrom(
  reason: string,
  status: string,
  httpStatus: number
): YoutubeLimit | null {
  if (DAILY_REASONS.indexOf(reason) !== -1) return "daily";
  if (BURST_REASONS.indexOf(reason) !== -1) return "burst";
  // RESOURCE_EXHAUSTED and a bare 429 name a limit without saying which one.
  // Read them as burst: retrying costs a single call and corrects itself,
  // where wrongly latching the day is a one-way flag that tells every room
  // search is dead until midnight while it is in fact still working.
  if (status === "RESOURCE_EXHAUSTED" || httpStatus === 429) return "burst";
  return null;
}

export async function fetchYoutubeApi(
  url: string,
  timeoutMs: number
): Promise<any> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  // Parse the body even on a non-2xx: the reason code is the only way to tell
  // "out of quota for today" apart from a burst ceiling or a key/config problem.
  const data = await resp.json().catch(() => null);
  const apiError = data?.error;
  if (!resp.ok || apiError) {
    throw new YoutubeApiError(
      apiError?.message || `YouTube API ${resp.status}`,
      limitFrom(
        apiError?.errors?.[0]?.reason ?? "",
        apiError?.status ?? "",
        resp.status
      )
    );
  }
  return data;
}
