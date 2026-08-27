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
  /** What YouTube actually said; `limit` above is only our reading of it. Kept
   *  because the Vercel log holding the same words is gone within the hour. */
  detail: string;
  constructor(message: string, limit: YoutubeLimit | null, detail: string) {
    super(message);
    this.name = "YoutubeApiError";
    this.limit = limit;
    this.quotaExceeded = limit !== null;
    this.detail = detail;
  }
}

const DAILY_REASONS = ["quotaExceeded", "dailyLimitExceeded"];
const BURST_REASONS = ["rateLimitExceeded", "userRateLimitExceeded"];

// Google's newer quota layer answers a spent *daily* allowance with a bare 429 +
// RESOURCE_EXHAUSTED and no `errors[].reason` — the shape a short-window ceiling
// arrives in too. Only the message parts them: "…and limit 'Queries per day'".
const PER_DAY_LIMIT = /per[\s-]*day/i;

function limitFrom(
  reason: string,
  status: string,
  httpStatus: number,
  message: string
): YoutubeLimit | null {
  if (DAILY_REASONS.indexOf(reason) !== -1) return "daily";
  if (BURST_REASONS.indexOf(reason) !== -1) return "burst";
  if (status === "RESOURCE_EXHAUSTED" || httpStatus === 429) {
    // Burst when the message names no window: a wrong burst costs one retry,
    // where wrongly latching the day tells every room search is dead til midnight.
    return PER_DAY_LIMIT.test(message) ? "daily" : "burst";
  }
  return null;
}

const MAX_DETAIL = 200;

/** YouTube's quota message carries markup ("exceeded your <a href=…>quota</a>"),
 *  which is noise in an analytics row. */
function compactDetail(
  httpStatus: number,
  reason: string,
  status: string,
  message: string
): string {
  const said = message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return [String(httpStatus), reason || status, said]
    .filter(Boolean)
    .join(" · ")
    .slice(0, MAX_DETAIL);
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
    const reason = apiError?.errors?.[0]?.reason ?? "";
    const status = apiError?.status ?? "";
    const message = apiError?.message || `YouTube API ${resp.status}`;
    throw new YoutubeApiError(
      message,
      limitFrom(reason, status, resp.status, message),
      compactDetail(resp.status, reason, status, message)
    );
  }
  return data;
}
