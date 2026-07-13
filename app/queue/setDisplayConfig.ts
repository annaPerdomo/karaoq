import { DisplayConfig } from "../../pages/api/types";

export default async function setDisplayConfig(
  roomId: string,
  config: DisplayConfig
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/display-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
