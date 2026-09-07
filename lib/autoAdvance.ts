/** Seconds into the song, off a YouTube `infoDelivery` message — the stream the
 * state handlers already listen to, so the limit needs no extra polling. */
export function playerCurrentTime(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { event?: unknown; info?: { currentTime?: unknown } };
  if (d.event !== "infoDelivery") return null;
  const t = d.info?.currentTime;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

/** Seconds of warning before the limit cuts the song; both surfaces share it. */
export const WRAP_UP_WARN_SECONDS = 15;

export function songSecondsLeft(
  currentTime: number | null,
  maxSongSeconds: number | null
): number | null {
  if (maxSongSeconds === null || currentTime === null) return null;
  return Math.max(0, Math.ceil(maxSongSeconds - currentTime));
}

/** Room.autoStartAt as the clients read it — ISO over JSON, a Date in-process. */
export function autoStartEpoch(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
