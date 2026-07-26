import { NextApiRequest, NextApiResponse } from "next";
import { trackSessionHeartbeat } from "../../../lib/analytics";
import { asLocale, isLocaleSource } from "../../../lib/i18n/activeLocale";
import { MAX_ENTRY_ID_LENGTH, MAX_NAME_LENGTH, rateLimit } from "../../../lib/limits";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: {
    roomId?: string;
    userName?: string;
    role?: string;
    clientId?: string;
    locale?: string;
    localeSource?: string;
  };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId, userName, role, clientId } = body;

  // Unrecognized language fields are dropped, not rejected — an old client isn't a reason to lose
  // the heartbeat — and narrowing keeps free text out of the session doc.
  const locale = asLocale(body.locale) ?? undefined;
  const localeSource = isLocaleSource(body.localeSource) ? body.localeSource : undefined;

  // Session docs key on roomId:clientId:role, so uncapped ids would let a script mint unlimited
  // MB-scale docs. The rate limit is generous: one beat per minute per tab keeps a NAT'd venue under it.
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
    typeof clientId === "string" ? clientId : undefined,
    locale,
    localeSource
  );
  res.status(200).json({ ok: true });
}
