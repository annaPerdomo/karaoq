import type { NextApiRequest, NextApiResponse } from "next";
import { SHELF_REFRESH_MS, getShelves, shelvesFreshFor } from "../../../lib/shelves";

const REGIONS = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** Each distinct code is its own CDN entry and cache doc, so made-up ones
 *  ("AA") fold into the worldwide shelves rather than multiplying them. */
function realCountry(param: unknown): string | null {
  if (typeof param !== "string" || !/^[A-Za-z]{2}$/.test(param)) return null;
  const code = param.toUpperCase();
  try {
    return REGIONS.of(code) ? code : null;
  } catch {
    return null;
  }
}

// The idea shelves for one country (lib/shelves). Identical for every caller
// in that country, so the CDN serves nearly every request.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  const country = realCountry(req.query.c);

  try {
    const shelves = await getShelves(country);
    res.setHeader(
      "Cache-Control",
      shelvesFreshFor(shelves) === SHELF_REFRESH_MS
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "public, s-maxage=300, stale-while-revalidate=600"
    );
    res.status(200).json({ shelves });
  } catch (e) {
    console.error("Shelves endpoint error:", e);
    // No cache header: an empty answer must not stick at the edge for an hour.
    res.status(200).json({ shelves: [] });
  }
}
