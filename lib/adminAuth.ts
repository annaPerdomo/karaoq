import { createHash, timingSafeEqual } from "crypto";
import type { NextApiRequest } from "next";

/**
 * Shared gate for every /api/analytics read/admin endpoint. Hash both sides
 * before comparing: timingSafeEqual demands equal-length buffers, and hashing
 * also keeps the comparison from leaking the secret's length.
 */
export function isAuthorizedAdmin(req: NextApiRequest): boolean {
  const expected = process.env.ANALYTICS_SECRET;
  const supplied = req.headers["x-analytics-secret"];
  if (!expected || typeof supplied !== "string") return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
