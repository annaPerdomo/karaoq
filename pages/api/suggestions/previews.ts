import type { NextApiRequest, NextApiResponse } from "next";
import { previewsFor } from "../../../lib/cutPick";
import { categorySongKeys } from "../../../lib/suggestionCatalog";

// Thumbnails and ready-to-add cuts for one browse category's songs, so a tap
// opens the preview straight away. Keyed by category, never by free-form song
// lists, so the CDN holds one entry per category.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  const category = req.query.category;
  const keys = typeof category === "string" ? categorySongKeys(category) : null;
  if (!keys) {
    res.status(404).json({ code: 404 });
    return;
  }

  try {
    const previews = await previewsFor(keys);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ previews });
  } catch (e) {
    console.error("Previews endpoint error:", e);
    // Rows without previews still work — a tap falls back to the cuts search.
    res.status(200).json({ previews: {} });
  }
}
