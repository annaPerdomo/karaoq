import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { LOGO_HASH_RE, LOGO_MAX_BYTES, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId, ROOM_CODE_PATTERN } from "../../../../lib/roomCode";
import { logoUrl } from "../../../../lib/logoUrl";
import {
  LogoStoreFullError,
  readLogo,
  saveDraftLogo,
  sniffImageType,
} from "../../../../lib/roomLogos";

export const config = { api: { bodyParser: { sizeLimit: "400kb" } } };

const DATA_URL_RE = /^data:[^,]*;base64,([A-Za-z0-9+/=\s]*)$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string" || !ROOM_CODE_PATTERN.test(roomId)) {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  if (req.method === "GET") {
    await serveLogo(req, res, roomId);
    return;
  }
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
  const dataUrl =
    body && typeof body === "object" ? (body as { dataUrl?: unknown }).dataUrl : undefined;
  const match = typeof dataUrl === "string" ? DATA_URL_RE.exec(dataUrl) : null;
  if (!match) {
    res.status(400).json({ code: 400, message: "Invalid logo data URL." });
    return;
  }

  if (!rateLimit(req, "logo", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many uploads, slow down." });
    return;
  }

  try {
    const rooms = await getRoomsCollection();
    const room = await rooms.findOne({ id: roomId }, { projection: { _id: 0, id: 1 } });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const buf = Buffer.from(match[1], "base64");
    if (buf.length > LOGO_MAX_BYTES) {
      await trackEvent(req, "logo_upload_rejected", { roomId, reason: "size" });
      res.status(413).json({ code: 413, message: "Logo is too large." });
      return;
    }
    // The data URL's declared type is ignored: an SVG labelled image/png stops here.
    const contentType = sniffImageType(buf);
    if (!contentType) {
      await trackEvent(req, "logo_upload_rejected", { roomId, reason: "type" });
      res.status(400).json({ code: 400, message: "Logo must be PNG, JPEG or WebP." });
      return;
    }

    let hash: string;
    try {
      hash = await saveDraftLogo(roomId, buf, contentType);
    } catch (e) {
      if (!(e instanceof LogoStoreFullError)) throw e;
      await trackEvent(req, "logo_upload_rejected", { roomId, reason: "storage_full" });
      res.status(507).json({ error: "storage_full" });
      return;
    }

    await trackEvent(req, "logo_uploaded", { roomId, bytes: buf.length });
    res.status(200).json({ hash, url: logoUrl(roomId, hash) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}

async function serveLogo(req: NextApiRequest, res: NextApiResponse, roomId: string) {
  const hash = req.query.h;
  if (typeof hash !== "string" || !LOGO_HASH_RE.test(hash)) {
    res.status(400).json({ code: 400, message: "Invalid logo hash." });
    return;
  }
  try {
    const logo = await readLogo(roomId, hash);
    if (!logo) {
      res.status(404).json({ code: 404, message: "Logo not found." });
      return;
    }
    res.setHeader("Content-Type", logo.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.status(200).send(logo.data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
