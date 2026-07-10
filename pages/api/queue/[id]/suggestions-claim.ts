import { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import { trackEvent } from "../../../../lib/analytics";
import { MAX_NAME_LENGTH, MAX_QUEUE_LENGTH, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import type { QueueEntry } from "../../types";

// Claim a suggested song ("I'll sing this"): queues it under the claimer's
// name and removes it from the board.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  let body: { suggestionId?: unknown; userName?: unknown };
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { suggestionId, userName } = body;
  if (
    typeof roomId !== "string" ||
    typeof suggestionId !== "string" ||
    typeof userName !== "string" ||
    userName.trim().length === 0 ||
    userName.length > MAX_NAME_LENGTH
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "suggestion-claim", 20, 30_000)) {
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

    const suggestions = room.suggestions ?? [];
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) {
      res.status(404).json({ code: 404, message: "Suggestion not found." });
      return;
    }
    if (room.queue.length >= MAX_QUEUE_LENGTH) {
      res.status(409).json({ code: 409, message: "Queue is full." });
      return;
    }

    const entry: QueueEntry = {
      id: uuidv4(),
      userName,
      songTitle: suggestion.songTitle,
      videoId: suggestion.videoId,
    };

    // One atomic write: the suggestion must still be on the board and the
    // queue under its cap at write time. Two concurrent claims can't both
    // match, so the loser gets a 409 instead of silently erasing the
    // winner's queue entry (or any concurrently added song).
    const result = await collection.updateOne(
      {
        id: roomId,
        "suggestions.id": suggestionId,
        $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] },
      },
      {
        $pull: { suggestions: { id: suggestionId } },
        $push: { queue: entry },
        $set: { lastActivity: new Date() },
      }
    );
    if (result.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "Someone already claimed this one." });
      return;
    }
    trackEvent(req, "suggestion_claimed", {
      roomId,
      userName,
      songTitle: suggestion.songTitle,
      videoId: suggestion.videoId,
    });
    // Also count it as a song add so core metrics (funnel, songs/room, top
    // songs) include queue entries that came through the board.
    trackEvent(req, "song_added", {
      roomId,
      userName,
      songTitle: suggestion.songTitle,
      videoId: suggestion.videoId,
      via: "board_claim",
    });
    res.status(200).json({ code: 200, message: "Added to queue." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
