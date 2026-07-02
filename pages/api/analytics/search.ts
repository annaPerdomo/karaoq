import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../lib/analytics";

// Records the first time anyone in a room runs a song search. Paired with
// room_created and song_added, this closes the activation funnel: it tells us
// whether 0-song rooms never engaged search at all, or searched and gave up.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: { roomId?: string; role?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId, role } = body;

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    await trackEvent(req, "search_performed", {
      roomId,
      role:
        role === "host" || role === "singer" || role === "display"
          ? role
          : undefined,
    });
  } catch (err) {
    // Analytics failure should not break the product flow
  }

  res.status(200).json({ ok: true });
}
