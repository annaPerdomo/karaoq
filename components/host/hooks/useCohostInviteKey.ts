import * as React from "react";
import mintCohostKey from "../../../app/queue/mintCohostKey";
import { getCohostLinkKey, setCohostLinkKey } from "../../../lib/roomKeyStore";

export type CohostKeyStatus = "none" | "loading" | "ready" | "error";

/** Minted once per room and cached, so every open of the invite reuses the
 * same key; legacy rooms never mint. `cohostUrl` stays empty until a keyed
 * room's key resolves, so a caller can't copy or show a keyless link. */
export function useCohostInviteKey(opts: {
  joinCode: string | undefined;
  roomKeyed: boolean | null;
  open: boolean;
  origin: string;
}): { cohostUrl: string; keyStatus: CohostKeyStatus; retryMint: () => void } {
  const { joinCode, roomKeyed, open, origin } = opts;
  const [cohostKey, setCohostKey] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<CohostKeyStatus>("none");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!open || !joinCode || !roomKeyed || cohostKey) return;
    const cached = getCohostLinkKey(joinCode);
    if (cached) {
      setCohostKey(cached);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    mintCohostKey(joinCode).then((key) => {
      if (cancelled) return;
      if (!key) {
        setStatus("error");
        return;
      }
      setCohostLinkKey(joinCode, key);
      setCohostKey(key);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [open, joinCode, roomKeyed, cohostKey, attempt]);

  const needsKey = roomKeyed && !cohostKey;
  const cohostUrl =
    !origin || !joinCode || needsKey
      ? ""
      : `${origin}/remote/${joinCode}${cohostKey ? `#k=${cohostKey}` : ""}`;

  return { cohostUrl, keyStatus: needsKey ? status : "ready", retryMint: () => setAttempt((n) => n + 1) };
}
