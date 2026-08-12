import { NextApiRequest, NextApiResponse } from "next";
import { isAnalyticsExempt, localeFromRequest } from "../../../lib/analytics";
import { sanitizeClientError } from "../../../lib/clientErrors";
import { MAX_STORED_UA_LENGTH, rateLimit } from "../../../lib/limits";
import { getClientErrorsCollection } from "../../../lib/mongodb";

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const report = sanitizeClientError(body);
  if (!report) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  // The reporter already throttles per message; this cap is for curl, not for
  // browsers. Rejections aren't recorded — an error flood must not become a
  // storage flood.
  if (!rateLimit(req, "client-error", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  if (isAnalyticsExempt(req)) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const collection = await getClientErrorsCollection();
    const locale = localeFromRequest(req);
    await collection.insertOne({
      ...report,
      userAgent: headerString(req.headers["user-agent"])?.slice(0, MAX_STORED_UA_LENGTH),
      country: headerString(req.headers["x-vercel-ip-country"]),
      region: headerString(req.headers["x-vercel-ip-region"]),
      city: headerString(req.headers["x-vercel-ip-city"]),
      ...(locale ? { locale } : {}),
      timestamp: new Date(),
    });
  } catch (e) {
    // Same contract as trackEvent: failing to record an error must never
    // surface as a second error to the person already looking at one.
    console.error("Client error write failed:", e);
  }

  res.status(200).json({ ok: true });
}
