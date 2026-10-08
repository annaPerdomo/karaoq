import * as React from "react";
import { getRoomKey, parseCohostKeyFragment, setRoomKey } from "../../../lib/roomKeyStore";

/** The co-host key rides the fragment so it never reaches a server log or
 * referrer; stored once, then stripped. A device already holding the host
 * key (the host opening their own link) keeps it instead. */
export function useCohostKeyFromFragment(remote: boolean, joinCode: string | undefined): void {
  React.useEffect(() => {
    if (!remote || !joinCode) return;
    const key = parseCohostKeyFragment(window.location.hash);
    if (!key) return;
    if (getRoomKey(joinCode)?.role !== "host") setRoomKey(joinCode, key, "cohost");
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [remote, joinCode]);
}
