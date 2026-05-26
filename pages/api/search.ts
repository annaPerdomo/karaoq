import { NextApiRequest, NextApiResponse } from "next";

const INVIDIOUS_INSTANCES = [
  "https://invidious.materialio.us",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const q = req.query.q;
  if (typeof q !== "string" || !q.trim()) {
    res.status(400).json({ code: 400, message: "Missing query." });
    return;
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const params = new URLSearchParams({ q, type: "video" });
      const resp = await fetch(`${instance}/api/v1/search?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;

      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const candidates = data
        .filter((item: any) => item.type === "video" && item.videoId)
        .slice(0, 16)
        .map((item: any) => ({
          title: item.title ?? "",
          thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
          videoId: item.videoId,
        }));

      // Check embeddability via YouTube oEmbed (401 = not embeddable)
      const checks = await Promise.all(
        candidates.map(async (r: any) => {
          try {
            const oembedResp = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${r.videoId}&format=json`,
              { method: "HEAD", signal: AbortSignal.timeout(3000) }
            );
            return oembedResp.ok ? r : null;
          } catch {
            return null;
          }
        })
      );

      const embeddable = checks.filter(Boolean).slice(0, 8);
      res.status(200).json(embeddable);
      return;
    } catch {
      // Try next instance
    }
  }

  res.status(502).json({ code: 502, message: "All search backends unavailable." });
}
