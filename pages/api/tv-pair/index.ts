import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../types";
import { rateLimit } from "../../../lib/limits";
import { getRoomsCollection, getTvPairingsCollection } from "../../../lib/mongodb";
import { normalizeRoomId } from "../../../lib/roomCode";
import { newPairCode, PAIR_TTL_MS } from "../../../lib/pairing";
import { allows, hashRoomKey, isLegacyRoom, mintRoomKey, roomKeyFromRequest } from "../../../lib/roomKeys";

const MAX_MINT_ATTEMPTS = 5;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ code: string; secret: string; expiresAt: number } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  const kind = (body as { kind?: unknown } | null)?.kind;
  if (kind !== "screen" && kind !== "remote") {
    res.status(400).json({ code: 400, message: "Invalid kind." });
    return;
  }

  if (!rateLimit(req, "tv-pair-create", 10, 300_000)) {
    res.status(429).json({ code: 429, message: "Too many pairing codes, try again later." });
    return;
  }

  let minterHash: string | undefined;

  try {
    if (kind === "remote") {
      const roomId = normalizeRoomId((body as { roomId?: unknown }).roomId as string | undefined);
      if (typeof roomId !== "string") {
        res.status(400).json({ code: 400, message: "Invalid room ID." });
        return;
      }
      const rooms = await getRoomsCollection();
      const room = await rooms.findOne({ id: roomId }, { projection: { keys: 1 } });
      const requestKey = roomKeyFromRequest(req);
      if (!room || isLegacyRoom(room) || !allows(room, requestKey, ["host"])) {
        res.status(403).json({ code: 403, message: "room-key" });
        return;
      }
      minterHash = hashRoomKey(requestKey as string);
    }

    const pairings = await getTvPairingsCollection();
    if (minterHash) {
      await pairings.deleteMany({ minterHash, claimedAt: { $exists: false } });
    }
    const secret = mintRoomKey();
    const now = new Date();
    let code: string | null = null;
    for (let i = 0; i < MAX_MINT_ATTEMPTS && !code; i++) {
      const candidate = newPairCode(kind);
      try {
        await pairings.insertOne({
          _id: candidate,
          kind,
          secretHash: hashRoomKey(secret),
          createdAt: now,
          ...(kind === "remote"
            ? { roomId: normalizeRoomId((body as { roomId?: unknown }).roomId as string) as string, minterHash }
            : {}),
        });
        code = candidate;
      } catch (e) {
        if ((e as { code?: number })?.code !== 11000) throw e;
      }
    }
    if (!code) {
      res.status(500).json({ code: 500, message: "Could not mint a pairing code." });
      return;
    }

    res.status(200).json({ code, secret, expiresAt: now.getTime() + PAIR_TTL_MS });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
