import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../types";
import { getTvPairingsCollection } from "../../../lib/mongodb";
import { PAIR_TTL_MS } from "../../../lib/pairing";
import { hashRoomKey } from "../../../lib/roomKeys";

type PollResponse =
  | { status: "waiting" }
  | { status: "expired" }
  | { status: "claimed"; roomId: string }
  | { status: "claimed"; roomId: string; yourRole: "display" };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PollResponse | ApiError>
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const code = req.query.code;
  const secretHeader = req.headers["x-pair-secret"];
  const secret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
  if (typeof code !== "string" || !secret) {
    res.status(404).json({ code: 404, message: "Not found." });
    return;
  }

  try {
    const pairings = await getTvPairingsCollection();
    const pairing = await pairings.findOne({ _id: code });
    if (!pairing || pairing.secretHash !== hashRoomKey(secret)) {
      res.status(404).json({ code: 404, message: "Not found." });
      return;
    }
    if (pairing.claimedAt && pairing.roomId) {
      res.status(200).json(
        pairing.kind === "remote" && pairing.minterHash
          ? { status: "claimed", roomId: pairing.roomId, yourRole: "display" }
          : { status: "claimed", roomId: pairing.roomId }
      );
      return;
    }
    if (Date.now() - pairing.createdAt.getTime() > PAIR_TTL_MS) {
      res.status(200).json({ status: "expired" });
      return;
    }
    res.status(200).json({ status: "waiting" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
