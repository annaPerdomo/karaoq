import type { Collection } from "mongodb";
import type { Reaction, Room } from "../pages/api/types";

export const MAX_REACTIONS = 50;
export const REACTION_TTL_MS = 30000;

export function liveReactions(room: Pick<Room, "reactions">, now: number): Reaction[] {
  return (room.reactions ?? []).filter((r) => now - r.timestamp < REACTION_TTL_MS);
}

/** $push, not a $set of the merged array: concurrent cheers used to clobber each
 *  other down to ~1 during the bursts cheers exist for. $slice bounds the doc. */
export async function appendReaction(
  collection: Collection<Room>,
  roomId: string,
  reaction: Reaction
): Promise<void> {
  await collection.updateOne(
    { id: roomId },
    {
      $push: { reactions: { $each: [reaction], $slice: -MAX_REACTIONS } },
      $set: { lastActivity: new Date() },
    }
  );
}
