import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../types";
import { rateLimit } from "../../../lib/limits";
import { getTvPairingsCollection } from "../../../lib/mongodb";
import { PAIR_TTL_MS } from "../../../lib/pairing";
import { hashPairSecret, newPairCode, newPairSecret } from "../../../lib/pairingServer";

const MAX_MINT_ATTEMPTS = 5;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ code: string; secret: string; expiresAt: number } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!rateLimit(req, "tv-pair-create", 10, 300_000)) {
    res.status(429).json({ code: 429, message: "Too many pairing codes, try again later." });
    return;
  }

  try {
    const pairings = await getTvPairingsCollection();
    const secret = newPairSecret();
    const now = new Date();
    let code: string | null = null;
    for (let i = 0; i < MAX_MINT_ATTEMPTS && !code; i++) {
      const candidate = newPairCode();
      try {
        await pairings.insertOne({ _id: candidate, secretHash: hashPairSecret(secret), createdAt: now });
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
