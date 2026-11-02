import { NextApiRequest, NextApiResponse } from "next";
import { SCREEN_EVENT_TTL_MS, trackEvent } from "../../../lib/analytics";
import { deviceTypeFromUA } from "../../../lib/deviceType";
import { rateLimit } from "../../../lib/limits";
import { normalizeRoomId, ROOM_CODE_PATTERN } from "../../../lib/roomCode";
import { SCREEN_HELP_OPTIONS, type ScreenHelpOption } from "../../../lib/screenHelp";

const BODY_KEYS = new Set(["roomId", "option"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: { roomId?: string; option?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  if (Object.keys(body).some((k) => !BODY_KEYS.has(k))) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  const roomId = typeof body.roomId === "string" ? normalizeRoomId(body.roomId) : null;
  if (typeof roomId !== "string" || !ROOM_CODE_PATTERN.test(roomId)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  const { option } = body;
  if (option !== undefined && !SCREEN_HELP_OPTIONS.includes(option as ScreenHelpOption)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "analytics-screen-help", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  const device = deviceTypeFromUA(req.headers["user-agent"]) ?? "desktop";
  const expiresAt = new Date(Date.now() + SCREEN_EVENT_TTL_MS);

  if (option) {
    await trackEvent(req, "screen_help_option", { roomId, device, option: option as ScreenHelpOption, expiresAt });
  } else {
    await trackEvent(req, "screen_help_opened", { roomId, device, expiresAt });
  }
  res.status(200).json({ ok: true });
}
