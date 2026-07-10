import { PlayMode } from "../../pages/api/types";

export default async function setPlayMode(
  roomId: string,
  playMode: PlayMode
): Promise<boolean> {
  const params = new URLSearchParams({ playMode });
  try {
    const resp = await fetch(`/api/queue/${roomId}/mode?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
