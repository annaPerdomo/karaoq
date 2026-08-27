import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import {
  DEFAULT_WANTED_LIMIT,
  wantedSearches,
  type WantedRank,
} from "../../../lib/searchDemandRead";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  const parsed = Number(req.query.limit);
  const rank: WantedRank = req.query.rank === "volume" ? "volume" : "breadth";

  try {
    const report = await wantedSearches({
      limit: Number.isFinite(parsed) ? parsed : DEFAULT_WANTED_LIMIT,
      rank,
      gapsOnly: req.query.gaps === "1",
    });
    res.status(200).json(report);
  } catch (e) {
    console.error("Wanted searches read failed:", e);
    res.status(500).json({ code: 500, message: "Failed to read demand." });
  }
}
