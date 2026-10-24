import type { NextApiRequest, NextApiResponse } from "next";
import { getWorldCharts } from "../../../lib/shelves";

// Every country's chart for "Charts around the world" in one response, so
// switching countries in the picker costs nothing. Identical for every caller.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  try {
    const charts = await getWorldCharts();
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ charts });
  } catch (e) {
    console.error("World charts endpoint error:", e);
    res.status(200).json({ charts: [] });
  }
}
