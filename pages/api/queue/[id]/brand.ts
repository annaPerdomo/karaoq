import { NextApiRequest, NextApiResponse } from "next";
import type { RoomBrand } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { isValidRoomBrand, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId, ROOM_CODE_PATTERN } from "../../../../lib/roomCode";
import { confirmLogo, deleteOtherLogos } from "../../../../lib/roomLogos";

const SURFACES = ["host", "display"] as const;
type Surface = (typeof SURFACES)[number];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string" || !ROOM_CODE_PATTERN.test(roomId)) {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ code: 400, message: "Invalid brand." });
    return;
  }
  const { brand, surface = "display" } = body as { brand?: unknown; surface?: unknown };
  if (!isValidRoomBrand(brand) || SURFACES.indexOf(surface as Surface) < 0) {
    res.status(400).json({ code: 400, message: "Invalid brand." });
    return;
  }

  if (!rateLimit(req, "brand", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many saves, slow down." });
    return;
  }

  const saved: RoomBrand = {
    ...(brand.logo ? { logo: brand.logo } : {}),
    ...(brand.accentA ? { accentA: brand.accentA } : {}),
    ...(brand.accentB ? { accentB: brand.accentB } : {}),
    ...(brand.logoScale !== undefined && brand.logoScale !== 1
      ? { logoScale: brand.logoScale }
      : {}),
  };

  try {
    // Re-checked even when the hash is already live, in case its doc is gone.
    if (saved.logo && !(await confirmLogo(roomId, saved.logo))) {
      res.status(400).json({ code: 400, message: "Unknown logo." });
      return;
    }

    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      { $set: { brand: saved, lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    await deleteOtherLogos(roomId, saved.logo);

    await trackEvent(req, "brand_saved", {
      roomId,
      logo: !!saved.logo,
      colors: !!(saved.accentA || saved.accentB),
      cleared: Object.keys(saved).length === 0,
      surface: surface as Surface,
      resized: saved.logoScale !== undefined,
    });
    res.status(200).json({ brand: saved });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
