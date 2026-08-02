import { v4 as uuidv4 } from "uuid";

export interface SingWithMeInput {
  songTitle: string;
  videoId: string;
  durationSeconds?: number;
  createdBy: string;
  anonymous: boolean;
  minSingers: number;
  maxSingers: number;
}

export default async function postSingWithMe(
  roomId: string,
  input: SingWithMeInput
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/sing-with-me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: uuidv4(), ...input }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
