import { createHostedRoom } from "../queue/createHostedRoom";
import { generateCode } from "../../lib/roomCode";

// No name-required guard, unlike handleHost: the host can name themselves after pairing.
export async function createRoomForPairing(hostName: string): Promise<string | null> {
  const name = hostName.trim();
  const code = generateCode();
  const result = await createHostedRoom(code);
  if (result !== "ok") return null;
  if (name) {
    try {
      localStorage.setItem("karaoq_host_name", name);
    } catch {}
  }
  return code;
}
