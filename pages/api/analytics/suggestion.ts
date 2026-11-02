import { NextApiRequest, NextApiResponse } from "next";
import { SUGGESTION_SOURCES, trackEvent, type SuggestionSource } from "../../../lib/analytics";
import { MAX_ENTRY_ID_LENGTH, MAX_TITLE_LENGTH, rateLimit } from "../../../lib/limits";
import { ideaFields } from "../../../lib/ideaSurface";

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
    ideaSurface?: unknown;
    ideaAway?: unknown;
  };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { roomId, suggestionSource, sectionId, categoryId, songTitle, songArtist } = body;

  // Length caps + rate limit: analytics docs never expire (only heartbeats
  // do), so unbounded ingestion is free-tier storage exhaustion.
  if (
    typeof roomId !== "string" ||
    roomId.length > MAX_ENTRY_ID_LENGTH ||
    typeof suggestionSource !== "string" ||
    !(SUGGESTION_SOURCES as readonly string[]).includes(suggestionSource)
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "analytics-suggestion", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  const capped = (value: unknown, max: number) =>
    typeof value === "string" && value.length <= max ? value : undefined;

  await trackEvent(req, "suggestion_used", {
    roomId,
    suggestionSource: suggestionSource as SuggestionSource,
    sectionId: capped(sectionId, MAX_ENTRY_ID_LENGTH),
    categoryId: capped(categoryId, MAX_ENTRY_ID_LENGTH),
    songTitle: capped(songTitle, MAX_TITLE_LENGTH),
    songArtist: capped(songArtist, MAX_TITLE_LENGTH),
    ...ideaFields(body),
  });

  res.status(200).json({ ok: true });
}
