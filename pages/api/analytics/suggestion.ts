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

  let body: {
    roomId?: string;
    suggestionSource?: string;
    sectionId?: string;
    categoryId?: string;
    songTitle?: string;
    songArtist?: string;
  };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId, suggestionSource, sectionId, categoryId, songTitle, songArtist } = body;

  if (
    typeof roomId !== "string" ||
    typeof suggestionSource !== "string" ||
    !["random", "song_pick", "genre_chip", "trending"].includes(suggestionSource)
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  await trackEvent(req, "suggestion_used", {
    roomId,
    suggestionSource: suggestionSource as "random" | "song_pick" | "genre_chip" | "trending",
    sectionId: typeof sectionId === "string" ? sectionId : undefined,
    categoryId: typeof categoryId === "string" ? categoryId : undefined,
    songTitle: typeof songTitle === "string" ? songTitle : undefined,
    songArtist: typeof songArtist === "string" ? songArtist : undefined,
  });

  res.status(200).json({ ok: true });
}
