import type { Collection } from "mongodb";
import type { NextApiRequest } from "next";
import { v4 as uuidv4 } from "uuid";

import { trackEvent } from "./analytics";
import { MAX_NAME_LENGTH, MAX_QUEUE_LENGTH } from "./limits";
import type { QueueEntry, Room } from "../pages/api/types";

/** Build the on-stage credit, keeping the queue entry name within its cap. */
export function creditNames(names: string[]): string {
  const joined = names.join(" & ");
  if (joined.length <= MAX_NAME_LENGTH) return joined;
  return `${names.length} singers`;
}

/**
 * Queue a "Sing with me" post if it has reached its minimum, then drop it from
 * the board once it's queued and full. Call after any write that can change the
 * balance between joined singers and `minSingers` — a join, or a host edit that
 * lowers the bar.
 *
 * Re-reads the room first: the caller's snapshot predates its own write, and a
 * concurrent join may have moved the post since. The `queued: $ne: true` filter
 * on the write is what guarantees exactly one caller wins the queueing.
 */
export async function queueSingWithMeIfReady(
  collection: Collection<Room>,
  roomId: string,
  postId: string,
  req: NextApiRequest
): Promise<boolean> {
  const fresh = await collection.findOne({ id: roomId });
  const post = (fresh?.singWithMe ?? []).find((p) => p.id === postId);
  if (!fresh || !post) return false;

  let queued = post.queued;
  if (
    !post.queued &&
    post.joinedSingers.length >= post.minSingers &&
    fresh.queue.length < MAX_QUEUE_LENGTH
  ) {
    const queuedEntry: QueueEntry = {
      id: uuidv4(),
      userName: creditNames(post.joinedSingers),
      songTitle: `🎤 ${post.songTitle}`,
      videoId: post.videoId,
    };
    const queueResult = await collection.updateOne(
      {
        id: roomId,
        singWithMe: { $elemMatch: { id: postId, queued: { $ne: true } } },
        $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] },
      },
      {
        $set: { "singWithMe.$.queued": true, lastActivity: new Date() },
        $push: { queue: queuedEntry },
      }
    );
    if (queueResult.matchedCount > 0) {
      queued = true;
      trackEvent(req, "singwithme_queued", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
      });
      // Also count it as a song add so core metrics (funnel, songs/room, top
      // songs) include group songs. No userName: the group credit string
      // would pollute per-singer stats, and joins are tracked individually.
      trackEvent(req, "song_added", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
        via: "singwithme",
      });
    }
  }

  if (queued && post.joinedSingers.length >= post.maxSingers) {
    await collection.updateOne(
      { id: roomId },
      { $pull: { singWithMe: { id: postId, queued: true } } }
    );
  }

  return queued;
}
