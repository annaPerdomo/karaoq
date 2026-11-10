import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { getAnalyticsDb } from "../../../lib/mongodb";
import { loadHosts } from "../../../lib/hostNights";
import {
  FEATURES_WINDOWS,
  loadFeatureTallies,
  summarizeFeatures,
} from "../../../lib/adminFeatureStats";

const DEFAULT_DAYS = 30;

function parseDays(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return DEFAULT_DAYS;
  if (typeof raw !== "string") return null;
  return FEATURES_WINDOWS.find((d) => String(d) === raw) ?? null;
}

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

  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ code: 400, message: "Unsupported window." });
    return;
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  try {
    const db = await getAnalyticsDb();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const [rows, hosts] = await Promise.all([
      loadFeatureTallies(db, new Date(since)),
      loadHosts(db),
    ]);
    res.status(200).json(summarizeFeatures(rows, hosts, since, days));
  } catch (e) {
    console.error("Features query error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
