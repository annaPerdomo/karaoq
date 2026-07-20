import { HostConfig } from "../../pages/api/types";

export default async function setHostConfig(
  roomId: string,
  config: HostConfig
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/host-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
