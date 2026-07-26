import { getActiveLocale, LOCALE_HEADER } from "../../lib/i18n/activeLocale";

export default async function createRoom(
  roomId: string,
  // Lets the server tell a reloading playback surface (reset play state) from a second host device (leave the song alone).
  priorPlayToken?: string | null
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      [LOCALE_HEADER]: getActiveLocale().locale,
    };
    if (priorPlayToken) headers["x-play-token"] = priorPlayToken;
    const resp = await fetch(`/api/queue/${roomId}`, { method: "POST", headers });
    return resp.ok;
  } catch {
    return false;
  }
}
