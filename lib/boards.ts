import type { Collection } from "mongodb";
import type { NextApiRequest } from "next";
import { v4 as uuidv4 } from "uuid";

import { trackEvent } from "./analytics";
import { fairPushSpec } from "./fairQueue";
import { MAX_NAME_LENGTH, MAX_QUEUE_LENGTH } from "./limits";
import type { QueueEntry, Room } from "../pages/api/types";

/** Build the on-stage credit, keeping the queue entry name within its cap. */
export function creditNames(names: string[]): string {
  const joined = names.join(" & ");
  if (joined.length <= MAX_NAME_LENGTH) return joined;
  return `${names.length} singers`;
}

/** Call after any write that can change joined-vs-minSingers. Re-reads the room (the caller's
 * snapshot predates its own write); the `queued: $ne: true` filter guarantees exactly one caller wins. */
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
      addedAt: Date.now(),
    };
    const graduate = {
      id: roomId,
      singWithMe: { $elemMatch: { id: postId, queued: { $ne: true } } },
      $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] },
    };
    const markQueued = {
      $set: { "singWithMe.$.queued": true, lastActivity: new Date() },
    };
    // Same CAS-with-retries as the search-add path, with a plain-append fallback — never drop the song.
    // activeVideoIndex rides in the CAS: video-ended advances it without touching the queue, so a stale $position could land on the now-playing slot.
    let queueResult: { matchedCount: number } = { matchedCount: 0 };
    if (fresh.fairMode) {
      for (let attempt = 0; attempt < 3 && queueResult.matchedCount === 0; attempt++) {
        const snap = attempt === 0 ? fresh : await collection.findOne({ id: roomId });
        if (!snap || !snap.fairMode) break;
        queueResult = await collection.updateOne(
          { ...graduate, queue: snap.queue, activeVideoIndex: snap.activeVideoIndex },
          {
            ...markQueued,
            $push: {
              queue: fairPushSpec(snap.queue, snap.activeVideoIndex, queuedEntry),
            },
          }
        );
      }
    }
    if (queueResult.matchedCount === 0) {
      queueResult = await collection.updateOne(graduate, {
        ...markQueued,
        $push: { queue: queuedEntry },
      });
    }
    if (queueResult.matchedCount > 0) {
      queued = true;
      trackEvent(req, "singwithme_queued", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
      });
      // No userName: the group credit string would pollute per-singer stats; joins are tracked individually.
      trackEvent(req, "song_added", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
        via: "singwithme",
        singers: post.joinedSingers.length,
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
