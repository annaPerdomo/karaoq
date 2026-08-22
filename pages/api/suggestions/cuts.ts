import type { NextApiRequest, NextApiResponse } from "next";
import { readSongCuts } from "../../../lib/corpusRead";
import { rateLimit } from "../../../lib/limits";

// A song we can't answer for 404s, never 5xx: the client falls through to the
// search it always ran, and a 5xx would put a failure page in front of a browse.

/** The song key is searchCacheKey() of a query, so it can't outgrow one. */
const MAX_KEY_LENGTH = 200;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const song = req.query.song;
  if (typeof song !== "string" || !song.trim() || song.length > MAX_KEY_LENGTH) {
    res.status(404).json({ code: 404 });
    return;
  }

  // A whole venue browses from one IP, and a 429 here doesn't slow anyone down
  // — it falls the tap through to the live search this endpoint exists to save.
  if (!rateLimit(req, "cuts", 120, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many requests, slow down." });
    return;
  }

  const cuts = await readSongCuts(song);
  if (!cuts) {
    res.status(404).json({ code: 404 });
    return;
  }

  // Identical for every caller and rewritten only overnight, so the CDN takes a
  // room's repeat taps — and the limit above only ever meters a catalog-walker.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400"
  );
  res.setHeader("x-karaoq-suggestions", "corpus");
  res.status(200).json(cuts);
}
