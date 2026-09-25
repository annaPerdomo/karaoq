import * as React from "react";
import { getRoomKey, onRoomKeyRejected } from "../../../lib/roomKeyStore";

export type HostAccess = "checking" | "allowed" | "locked";

/** `roomKeyed` is null until the room's first fetch resolves (`checking`);
 * false for a legacy room (`allowed`); true once the room carries keys, at
 * which point access depends on what's stored for this device. */
export function useHostAccess(
  joinCode: string | undefined,
  remote: boolean,
  roomKeyed: boolean | null
): HostAccess {
  const [revoked, setRevoked] = React.useState(false);

  React.useEffect(() => {
    setRevoked(false);
    if (!joinCode) return;
    return onRoomKeyRejected(joinCode, () => setRevoked(true));
  }, [joinCode]);

  if (!joinCode || roomKeyed === null) return "checking";
  if (revoked) return "locked";
  if (!roomKeyed) return "allowed";

  const stored = getRoomKey(joinCode);
  if (!stored) return "locked";
  const allowedRoles = remote ? ["host", "cohost"] : ["host"];
  return allowedRoles.includes(stored.role) ? "allowed" : "locked";
}
