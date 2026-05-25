import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../lib/analytics";

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

  if (typeof roomId !== "string" || !roomId) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  await trackEvent(req, "qr_printed", { roomId });
  res.status(200).json({ ok: true });
}
