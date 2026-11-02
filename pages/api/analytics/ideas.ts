import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { computeIdeasImpact } from "../../../lib/ideasImpact";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }
  try {
    res.status(200).json(await computeIdeasImpact());
  } catch (e) {
    console.error("Ideas impact read failed:", e);
    res.status(500).json({ code: 500, message: "Failed to read ideas impact." });
  }
}
