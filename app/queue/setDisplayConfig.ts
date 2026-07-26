import { DisplayConfig } from "../../pages/api/types";

/** `boardsOnDisplay` is room state, not a DisplayConfig field; it rides along as a query param so one save stays one write/event. */
export default async function setDisplayConfig(
  roomId: string,
  config: DisplayConfig,
  boardsOnDisplay?: boolean
): Promise<boolean> {
  const qs =
    boardsOnDisplay === undefined
      ? ""
      : `?${new URLSearchParams({ boardsOnDisplay: String(boardsOnDisplay) })}`;
  try {
    const resp = await fetch(`/api/queue/${roomId}/display-config${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
