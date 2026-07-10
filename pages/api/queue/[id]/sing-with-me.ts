import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import {
  MAX_SING_WITH_ME,
  isValidSingWithMePost,
  rateLimit,
} from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import type { SingWithMePost } from "../../types";

// Create a "Sing with me" post. Others join it via sing-with-me-join; it
// auto-adds to the queue once minSingers have joined.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: Record<string, unknown>;
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const anonymous = body.anonymous === true;
  const createdBy = anonymous ? "" : (body.createdBy as string) ?? "";
  const post: SingWithMePost = {
    id: body.id as string,
    songTitle: body.songTitle as string,
    videoId: body.videoId as string,
    createdBy,
    anonymous,
    minSingers: body.minSingers as number,
    maxSingers: body.maxSingers as number,
    // Creator counts as the first singer when they attach their name.
    joinedSingers: createdBy ? [createdBy] : [],
    queued: false,
    timestamp: Date.now(),
  };

  if (!isValidSingWithMePost(post)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "singwithme", 10, 30_000)) {
    res.status(429).json({ code: 429, message: "Too many posts, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    if ((room.singWithMe?.length ?? 0) >= MAX_SING_WITH_ME) {
      res.status(409).json({ code: 409, message: "Too many active posts." });
      return;
    }

    // Cap enforced in the filter so concurrent adds can't overshoot it
    // between the length check above and the write.
    const result = await collection.updateOne(
      {
        id: roomId,
        $expr: { $lt: [{ $size: { $ifNull: ["$singWithMe", []] } }, MAX_SING_WITH_ME] },
      },
      { $push: { singWithMe: post }, $set: { lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "Too many active posts." });
      return;
    }
    trackEvent(req, "singwithme_posted", {
      roomId,
      userName: createdBy || undefined,
      songTitle: post.songTitle,
      videoId: post.videoId,
    });
    res.status(200).json({ code: 200, message: "Posted." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
