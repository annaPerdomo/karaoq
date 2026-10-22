import { getActiveLocale, LOCALE_HEADER } from "../../lib/i18n/activeLocale";
import { firstTouchHeaders } from "../../lib/firstTouch";
import { rememberLastHostedRoom } from "../../lib/lastRoom";

export async function createHostedRoom(
  code: string,
  opts?: { custom?: boolean }
): Promise<"ok" | "in-use" | "error"> {
  try {
    const headers: Record<string, string> = {
      [LOCALE_HEADER]: getActiveLocale().locale,
      ...firstTouchHeaders(),
    };
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
