import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection, getTvPairingsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { PAIR_TTL_MS } from "../../../../lib/pairing";
import { allows, hashRoomKey, isLegacyRoom, mintRoomKey, roomKeyFromRequest } from "../../../../lib/roomKeys";

// A cap on display keys minted by pairing only — host keys are never evicted.
const MAX_DISPLAY_KEYS = 10;

type ClaimResponse =
  | { kind: "screen"; roomId: string }
  | { kind: "remote"; roomId: string; roomKey: string; roomKeyRole: "host" };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClaimResponse | { message: string } | ApiError>
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

    const rooms = await getRoomsCollection();

    if (pairing.kind === "screen") {
      const roomId = normalizeRoomId((body as { roomId?: unknown }).roomId as string | undefined);
      if (typeof roomId !== "string") {
        res.status(409).json({ message: "needs-room" });
        return;
      }
      const room = await rooms.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }
      if (!isLegacyRoom(room) && !allows(room, roomKeyFromRequest(req), ["host", "cohost"])) {
        res.status(403).json({ code: 403, message: "room-key" });
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

      if (!isLegacyRoom(room)) {
        const displayKeys = (room.keys ?? []).filter((k) => k.role === "display");
        if (displayKeys.length >= MAX_DISPLAY_KEYS) {
          const oldest = displayKeys.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
          await rooms.updateOne({ id: roomId }, { $pull: { keys: { hash: oldest.hash } } });
        }
        await rooms.updateOne(
          { id: roomId },
          { $push: { keys: { hash: pairing.secretHash, role: "display", createdAt: new Date() } } }
        );
      }
      await rooms.updateOne(
        { id: roomId },
        { $set: { playMode: "tv", lastActivity: new Date() } }
      );

      await trackEvent(req, "tv_paired", { roomId, pairKind: "screen" });
      res.status(200).json({ kind: "screen", roomId });
      return;
    }

    // kind === "remote": the pairing already carries the minting device's room.
    const roomId = pairing.roomId;
    if (!roomId) {
      res.status(500).json({ code: 500, message: "Internal server error." });
      return;
    }

    const claimed = await pairings.findOneAndUpdate(
      { _id: code, claimedAt: { $exists: false }, createdAt: { $gt: new Date(Date.now() - PAIR_TTL_MS) } },
      { $set: { claimedAt: new Date() } }
    );
    if (!claimed) {
      res.status(410).json({ message: "pair-expired" });
      return;
    }

    const roomKey = mintRoomKey();
    const newKeyHash = hashRoomKey(roomKey);
    await rooms.updateOne(
      { id: roomId },
      {
        $push: { keys: { hash: newKeyHash, role: "host", createdAt: new Date() } },
        $set: { lastActivity: new Date() },
      }
    );

    if (pairing.minterHash) {
      const demoted = await rooms.updateOne(
        { id: roomId, keys: { $elemMatch: { hash: pairing.minterHash, role: "host" } } },
        { $set: { "keys.$.role": "display" } }
      );
      if (demoted.modifiedCount === 0) {
        await rooms.updateOne({ id: roomId }, { $pull: { keys: { hash: newKeyHash } } });
        res.status(410).json({ message: "pair-expired" });
        return;
      }
    }

    await trackEvent(req, "tv_paired", { roomId, pairKind: "remote" });
    res.status(200).json({ kind: "remote", roomId, roomKey, roomKeyRole: "host" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
