import { DisplayConfig } from "../../pages/api/types";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

/** `boardsOnDisplay` is room state, not a DisplayConfig field; it rides along as a query param so one save stays one write/event. */
export default async function setDisplayConfig(
  roomId: string,
  config: DisplayConfig,
  boardsOnDisplay?: boolean
): Promise<boolean | "forbidden"> {
  const qs =
    boardsOnDisplay === undefined
      ? ""
      : `?${new URLSearchParams({ boardsOnDisplay: String(boardsOnDisplay) })}`;
  try {
    const resp = await fetch(`/api/queue/${roomId}/display-config${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify(config),
    });
    if (resp.status === 403) {
      notifyRoomKeyRejected(roomId);
      return "forbidden";
    }
    return resp.ok;
  } catch {
    return false;
  }
}
