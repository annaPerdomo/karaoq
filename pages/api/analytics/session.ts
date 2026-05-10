import { NextApiRequest, NextApiResponse } from "next";
import { trackSessionHeartbeat } from "../../../lib/analytics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const { roomId, userName, role } = typeof req.body === "string"
    ? JSON.parse(req.body)
    : req.body;

  if (
    typeof roomId !== "string" ||
    typeof userName !== "string" ||
    !["host", "singer", "display"].includes(role)
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  await trackSessionHeartbeat(req, roomId, userName, role);
  res.status(200).json({ ok: true });
}
