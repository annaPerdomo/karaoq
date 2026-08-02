import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import {
  MAX_SUGGESTIONS,
  isValidSuggestedSong,
  rateLimit,
  sanitizeSongDuration,
} from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import type { SuggestedSong } from "../../types";

// Suggest a song for the room. Any singer can later claim it to sing it.
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
  // Dropped rather than rejected when implausible — the request still goes up.
  const durationSeconds = sanitizeSongDuration(body.durationSeconds);
  const suggestion: SuggestedSong = {
    id: body.id as string,
    songTitle: body.songTitle as string,
    videoId: body.videoId as string,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    suggestedBy: anonymous ? "" : (body.suggestedBy as string) ?? "",
    anonymous,
    timestamp: Date.now(),
  };

  if (!isValidSuggestedSong(suggestion)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "suggestion", 15, 30_000)) {
    res.status(429).json({ code: 429, message: "Too many suggestions, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    if ((room.suggestions?.length ?? 0) >= MAX_SUGGESTIONS) {
      res.status(409).json({ code: 409, message: "Suggestions board is full." });
      return;
    }

    // Cap enforced in the filter so concurrent adds can't overshoot it
    // between the length check above and the write.
    const result = await collection.updateOne(
      {
        id: roomId,
        $expr: { $lt: [{ $size: { $ifNull: ["$suggestions", []] } }, MAX_SUGGESTIONS] },
      },
      { $push: { suggestions: suggestion }, $set: { lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "Suggestions board is full." });
      return;
    }
    trackEvent(req, "song_suggested", {
      roomId,
      userName: suggestion.suggestedBy || undefined,
      songTitle: suggestion.songTitle,
      videoId: suggestion.videoId,
    });
    res.status(200).json({ code: 200, message: "Suggested." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
