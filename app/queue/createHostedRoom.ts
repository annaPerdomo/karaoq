import { rememberLastHostedRoom } from "../../lib/lastRoom";

export async function createHostedRoom(
  code: string,
  opts?: { custom?: boolean }
): Promise<"ok" | "in-use" | "error"> {
  try {
    const headers: Record<string, string> = {};
    if (opts?.custom) headers["x-custom-code"] = "1";
    const resp = await fetch(`/api/queue/${code}`, { method: "POST", headers });
    if (resp.ok) {
      rememberLastHostedRoom(code);
      return "ok";
    }
    if (resp.status === 409) return "in-use";
    return "error";
  } catch {
    return "error";
  }
}
