import { createHostedRoom } from "../queue/createHostedRoom";
import { generateCode } from "../../lib/roomCode";

/** Same random-code creation handleHost does, minus the name-required guard:
 * a TV pair can start blank and the host can name themselves later. */
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
