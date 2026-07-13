import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { queueSingWithMeIfReady } from "../../../../lib/boards";
import { MAX_NAME_LENGTH, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Join a "Sing with me" post. When the number of joined singers reaches
// minSingers, the song auto-adds to the queue (once); further joins up to
// maxSingers keep adding names to the on-stage credit until it plays.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  let body: { postId?: unknown; userName?: unknown };
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { postId, userName } = body;
  if (
    typeof roomId !== "string" ||
    typeof postId !== "string" ||
    typeof userName !== "string" ||
    userName.trim().length === 0 ||
    userName.length > MAX_NAME_LENGTH
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "singwithme-join", 20, 30_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const posts = room.singWithMe ?? [];
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      res.status(404).json({ code: 404, message: "Post not found." });
      return;
    }

    if (post.joinedSingers.includes(userName)) {
      res.status(409).json({ code: 409, message: "Already joined." });
      return;
    }
    if (post.joinedSingers.length >= post.maxSingers) {
      res.status(409).json({ code: 409, message: "This song is full." });
      return;
    }

    // Step 1: atomically add the name. The $elemMatch re-checks "not already
    // joined" and "not full" at write time, so concurrent joins can't clobber
    // each other's names or overshoot maxSingers the way the old
    // snapshot-write-back could.
    const joinResult = await collection.updateOne(
      {
        id: roomId,
        singWithMe: {
          $elemMatch: {
            id: postId,
            joinedSingers: { $ne: userName },
            [`joinedSingers.${post.maxSingers - 1}`]: { $exists: false },
          },
        },
      },
      {
        $push: { "singWithMe.$.joinedSingers": userName },
        $set: { lastActivity: new Date() },
      }
    );
    if (joinResult.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "Already joined." });
      return;
    }

    trackEvent(req, "singwithme_joined", {
      roomId,
      userName,
      songTitle: post.songTitle,
      videoId: post.videoId,
    });

    // Step 2: queue the song once minSingers is reached. This runs on every
    // join while the post is still unqueued — not just the crossing join —
    // so a post that missed its moment (e.g. the queue was full right then)
    // retries instead of staying dead on the board forever.
    const queued = await queueSingWithMeIfReady(collection, roomId, postId, req);

    res.status(200).json({ code: 200, message: "Joined.", queued });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
