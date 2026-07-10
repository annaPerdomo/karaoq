import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../lib/analytics";
import { MAX_ENTRY_ID_LENGTH, rateLimit } from "../../../lib/limits";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: { roomId?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId } = body;

  // Length caps + rate limit: analytics docs live on the Atlas free tier and
  // (unlike heartbeats) never expire, so a scripted client must not be able
  // to fill it with MB-scale junk.
  if (typeof roomId !== "string" || !roomId || roomId.length > MAX_ENTRY_ID_LENGTH) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "analytics-print", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  await trackEvent(req, "qr_printed", { roomId });
  res.status(200).json({ ok: true });
}
