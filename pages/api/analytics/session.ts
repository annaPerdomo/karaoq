import { NextApiRequest, NextApiResponse } from "next";
import { trackSessionHeartbeat } from "../../../lib/analytics";
import { MAX_ENTRY_ID_LENGTH, MAX_NAME_LENGTH, rateLimit } from "../../../lib/limits";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: { roomId?: string; userName?: string; role?: string; clientId?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId, userName, role, clientId } = body;

  // Length caps + rate limit: session docs key on roomId:clientId:role, so
  // uncapped ids let a script mint unlimited MB-scale docs on the free tier.
  // The limit is generous — heartbeats fire once a minute per tab, so even a
  // venue's worth of guests behind one NAT stays well under it.
  if (
    typeof roomId !== "string" ||
    roomId.length > MAX_ENTRY_ID_LENGTH ||
    typeof userName !== "string" ||
    userName.length > MAX_NAME_LENGTH ||
    typeof role !== "string" ||
    !["host", "singer", "display"].includes(role) ||
    (clientId !== undefined &&
      (typeof clientId !== "string" || clientId.length > MAX_ENTRY_ID_LENGTH))
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "analytics-session", 300, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  await trackSessionHeartbeat(
    req,
    roomId,
    userName,
    role as "host" | "singer" | "display",
    typeof clientId === "string" ? clientId : undefined
  );
  res.status(200).json({ ok: true });
}
