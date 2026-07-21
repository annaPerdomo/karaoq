import { getActiveLocale, LOCALE_HEADER } from "../../lib/i18n/activeLocale";

export default async function createRoom(
  roomId: string,
  // The play token this device stored the last time it started a song here.
  // Lets the server tell a reloading playback surface (reset play state)
  // apart from an additional host device joining (leave the song alone).
  priorPlayToken?: string | null
): Promise<boolean> {
  try {
    // Tag the create with the UI language so room_created records the language
    // the host set the room up in — the one metric sessions can't give us for
    // rooms nobody ever sings in.
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
