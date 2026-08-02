import { NextApiRequest, NextApiResponse } from "next";
import { queueSingWithMeIfReady } from "../../../../lib/boards";
import {
  isValidSingWithMePost,
  rateLimit,
  sanitizeSongDuration,
} from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Edit an open "Sing with me" post: the song, and how many singers it wants.
// Only while it's still open — a queued post's song is fixed, or the board and
// the queue would disagree about which video is coming up.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  let body: Record<string, unknown>;
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const postId = body.postId;
  // A name means "the poster is editing their own" and must match. Host
  // moderation omits it, exactly like the remove route.
  const requester = typeof body.userName === "string" ? body.userName : undefined;
  if (typeof roomId !== "string" || typeof postId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "singwithme-edit", 20, 30_000)) {
    res.status(429).json({ code: 429, message: "Too many edits, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const target = (room.singWithMe ?? []).find((p) => p.id === postId);
    if (!target) {
      res.status(404).json({ code: 404, message: "Post not found." });
      return;
    }
    if (requester !== undefined && target.createdBy !== requester) {
      res.status(403).json({ code: 403, message: "Only the person who posted this can edit it." });
      return;
    }
    if (target.queued) {
      res.status(409).json({ code: 409, message: "This post is already in the queue." });
      return;
    }

    // Validate the *result* of the edit, so it can never write a post the create
    // route would have rejected. Identity fields are spread from the stored post
    // and never taken from the body — a host fixing someone else's song must not
    // be able to rewrite who they are.
    const edited = {
      ...target,
      songTitle: body.songTitle,
      videoId: body.videoId,
      minSingers: body.minSingers,
      maxSingers: body.maxSingers,
    };
    if (!isValidSingWithMePost(edited)) {
      res.status(400).json({ code: 400, message: "Invalid request." });
      return;
    }
    // Nobody can be evicted from a song they already joined.
    if (edited.maxSingers < target.joinedSingers.length) {
      res.status(400).json({
        code: 400,
        message: "Max singers can't be lower than the number already singing.",
      });
      return;
    }

    // A swap to a different video must not inherit the old song's length — the
    // queue-time estimate would quietly lie. No new length + same video keeps
    // whatever was stored.
    const nextDuration = sanitizeSongDuration(body.durationSeconds);
    const dropStaleDuration =
      nextDuration === undefined &&
      edited.videoId !== target.videoId &&
      target.durationSeconds !== undefined;

    // The queued guard rides on the write too — a join could have queued this
    // post between the read above and here.
    const result = await collection.updateOne(
      { id: roomId, singWithMe: { $elemMatch: { id: postId, queued: { $ne: true } } } },
      {
        $set: {
          "singWithMe.$.songTitle": edited.songTitle,
          "singWithMe.$.videoId": edited.videoId,
          "singWithMe.$.minSingers": edited.minSingers,
          "singWithMe.$.maxSingers": edited.maxSingers,
          ...(nextDuration !== undefined
            ? { "singWithMe.$.durationSeconds": nextDuration }
            : {}),
          lastActivity: new Date(),
        },
        ...(dropStaleDuration
          ? { $unset: { "singWithMe.$.durationSeconds": "" } }
          : {}),
      }
    );
    if (result.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "This post is already in the queue." });
      return;
    }

    // Lowering "singers needed" to at or below the number already joined makes
    // the post ready, and no further join is coming to notice that.
    const queued = await queueSingWithMeIfReady(collection, roomId, postId, req);

    res.status(200).json({ code: 200, message: "Updated.", queued });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
