import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection, getTvPairingsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { PAIR_TTL_MS } from "../../../../lib/pairing";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ roomId: string } | { message: string } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const code = req.query.code;
  if (typeof code !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "tv-pair-claim", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many attempts, try again later." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  try {
    const pairings = await getTvPairingsCollection();
    const pairing = await pairings.findOne({ _id: code });
    const expired =
      !pairing || Date.now() - pairing.createdAt.getTime() > PAIR_TTL_MS || !!pairing.claimedAt;
    if (expired) {
      res.status(410).json({ message: "pair-expired" });
      return;
    }

    const roomId = normalizeRoomId((body as { roomId?: unknown }).roomId as string | undefined);
    if (typeof roomId !== "string") {
      res.status(409).json({ message: "needs-room" });
      return;
    }
    const rooms = await getRoomsCollection();
    const room = await rooms.findOne({ id: roomId }, { projection: { _id: 1 } });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const claimed = await pairings.findOneAndUpdate(
      { _id: code, claimedAt: { $exists: false }, createdAt: { $gt: new Date(Date.now() - PAIR_TTL_MS) } },
      { $set: { roomId, claimedAt: new Date() } }
    );
    if (!claimed) {
      res.status(410).json({ message: "pair-expired" });
      return;
    }

    await rooms.updateOne({ id: roomId }, { $set: { playMode: "tv", lastActivity: new Date() } });

    await trackEvent(req, "tv_paired", { roomId });
    res.status(200).json({ roomId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
