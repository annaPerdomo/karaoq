import type { NextApiRequest, NextApiResponse } from "next";

// Echo Vercel's IP-derived country so the client can localize the suggestion
// lists. Per-visitor data — must never be CDN-cached.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const header = req.headers["x-vercel-ip-country"];
  const country = (Array.isArray(header) ? header[0] : header) || null;
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json({ country });
}
