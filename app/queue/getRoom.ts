import { Room } from "../../pages/api/types";

export default async function getRoom(roomId: string): Promise<Room | null> {
  const resp = await fetch(`/api/queue/${roomId}`);
  if (!resp.ok) return null;
  return resp.json();
}
