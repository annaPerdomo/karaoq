import * as React from "react";
import getRoom from "../../../app/queue/getRoom";
import { useHostAccess, HostAccess } from "./useHostAccess";

/** One fetch, independent of HostBody's own init/poll, just to learn whether
 * the room is keyed. A 404 reads as legacy: HostBody's own init creates the
 * room and gets the key, so gating a not-yet-created room would just flash
 * "locked". A transient fetch error retries rather than failing open. */
export function useHostGate(joinCode: string | undefined, remote: boolean): HostAccess {
  const [roomKeyed, setRoomKeyed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    async function check() {
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room === "error") {
        retryTimer = setTimeout(check, 1500);
        return;
      }
      setRoomKeyed(room === "notFound" ? false : (room.keyed ?? false));
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [joinCode]);

  return useHostAccess(joinCode, remote, roomKeyed);
}
