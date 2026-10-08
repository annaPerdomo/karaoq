import { rememberLastHostedRoom } from "../../lib/lastRoom";
import { clearCohostLinkKey, setRoomKey } from "../../lib/roomKeyStore";
import { ROOM_KEYS_HEADER } from "../../lib/roomKeysHeader";

export async function createHostedRoom(
  code: string,
  opts?: { custom?: boolean }
): Promise<"ok" | "in-use" | "error"> {
  try {
    const headers: Record<string, string> = { [ROOM_KEYS_HEADER]: "1" };
    if (opts?.custom) headers["x-custom-code"] = "1";
    const resp = await fetch(`/api/queue/${code}`, { method: "POST", headers });
    if (resp.ok) {
      rememberLastHostedRoom(code);
      const data = (await resp.json()) as { roomKey?: unknown };
      if (typeof data.roomKey === "string") {
        setRoomKey(code, data.roomKey, "host");
        // A new host key means any previously-shared invite link is stale.
        clearCohostLinkKey(code);
      }
      return "ok";
    }
    if (resp.status === 409) return "in-use";
    return "error";
  } catch {
    return "error";
  }
}
