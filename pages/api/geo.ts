import type { NextApiRequest, NextApiResponse } from "next";
import { requestCountry } from "../../lib/platform";

// Echo the platform's IP-derived country so the client can localize the
// suggestion lists. Per-visitor data — must never be CDN-cached.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const country = requestCountry(req) ?? null;
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json({ country });
}
