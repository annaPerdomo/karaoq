import { NextApiRequest, NextApiResponse } from "next";
import {
  isValidSuggestedSong,
  rateLimit,
  sanitizeSongDuration,
} from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Edit a requested song — swap it for a different version.
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

  const suggestionId = body.suggestionId;
  // A name means "the requester is editing their own" and must match. Host
  // moderation omits it, exactly like the remove route.
  const requester = typeof body.userName === "string" ? body.userName : undefined;
  if (typeof roomId !== "string" || typeof suggestionId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "suggestions-edit", 20, 30_000)) {
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

    const target = (room.suggestions ?? []).find((s) => s.id === suggestionId);
    if (!target) {
      res.status(404).json({ code: 404, message: "Suggestion not found." });
      return;
    }
    if (requester !== undefined && target.suggestedBy !== requester) {
      res.status(403).json({ code: 403, message: "Only the person who requested this can edit it." });
      return;
    }

    // Validate the *result* of the edit, so it can never write a request the
    // create route would have rejected. Identity is spread from the stored
    // request and never taken from the body — a host fixing someone's request
    // must not be able to rewrite who asked for it.
    const edited = {
      ...target,
      songTitle: body.songTitle,
      videoId: body.videoId,
    };
    if (!isValidSuggestedSong(edited)) {
      res.status(400).json({ code: 400, message: "Invalid request." });
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

    const result = await collection.updateOne(
      { id: roomId, "suggestions.id": suggestionId },
      {
        $set: {
          "suggestions.$.songTitle": edited.songTitle,
          "suggestions.$.videoId": edited.videoId,
          ...(nextDuration !== undefined
            ? { "suggestions.$.durationSeconds": nextDuration }
            : {}),
          lastActivity: new Date(),
        },
        ...(dropStaleDuration
          ? { $unset: { "suggestions.$.durationSeconds": "" } }
          : {}),
      }
    );
    if (result.matchedCount === 0) {
      // Claimed or withdrawn between the read and the write.
      res.status(404).json({ code: 404, message: "Suggestion not found." });
      return;
    }

    res.status(200).json({ code: 200, message: "Updated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
