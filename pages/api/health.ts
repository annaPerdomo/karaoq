import { NextApiRequest, NextApiResponse } from "next";
import { getMongoClient } from "../../lib/mongodb";

const PING_TIMEOUT_MS = 2_000;
const PING_CACHE_MS = 5_000;

let cachedPingAt = 0;
let cachedPingOk = false;

function version(): string {
  return (
    process.env.KARAOQ_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    "dev"
  );
}

async function pingDb(): Promise<boolean> {
  if (Date.now() - cachedPingAt < PING_CACHE_MS) return cachedPingOk;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([
    getMongoClient()
      .then((client) => client.db(process.env.MONGODB_DB).command({ ping: 1 }))
      .then(() => true)
      .catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);

  cachedPingAt = Date.now();
  cachedPingOk = ok;
  return ok;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const uptimeS = Math.floor(process.uptime());
  const ok = await pingDb();

  res.status(ok ? 200 : 503).json({
    ok,
    version: version(),
    db: ok ? "ok" : "error",
    uptimeS,
  });
}
