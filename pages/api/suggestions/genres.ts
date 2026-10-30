import type { NextApiRequest, NextApiResponse } from "next";
import { PLACE_GENRES } from "../../../lib/genreCharts";
import { SHELF_REFRESH_MS } from "../../../lib/shelves";
import { genresFreshFor, getGenreShelves } from "../../../lib/genreShelves";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  const place = typeof req.query.c === "string" ? req.query.c.toLowerCase() : "";
  // Only charted places, so made-up codes can't multiply cache docs.
  if (!/^[a-z]{2}$/.test(place) || !PLACE_GENRES[place]) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.status(200).json({ genres: [] });
    return;
  }

  try {
    const genres = await getGenreShelves(place);
    res.setHeader(
      "Cache-Control",
      genresFreshFor(genres) === SHELF_REFRESH_MS
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "public, s-maxage=300, stale-while-revalidate=600"
    );
    res.status(200).json({ genres });
  } catch (e) {
    console.error("Genres endpoint error:", e);
    // No cache header: an empty answer must not stick at the edge for an hour.
    res.status(200).json({ genres: [] });
  }
}
