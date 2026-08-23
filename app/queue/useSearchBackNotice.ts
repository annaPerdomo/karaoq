import * as React from "react";

import { Room } from "../../pages/api/types";

// Survives the night: a phone that saw quota-out and only comes back tomorrow
// still gets told, once, that search recovered.
const STORAGE_KEY = "karaoq_search_quota_out";
export const NOTICE_MS = 12_000;

/**
 * Tells a room that spent the evening pasting links when song search works
 * again. Feed every room snapshot through `applyRoom`; the notice fires on
 * the poll where the server's quota-out flag disappears — midnight with the
 * page open, or the next glance at the tab (polling pauses while hidden).
 * On mount, a stored reset time already in the past fires it for singers
 * who reopen the page after the reset instead.
 */
export function useSearchBackNotice() {
  const [show, setShow] = React.useState(false);
  const wasOutRef = React.useRef(false);
  const hideRef = React.useRef<ReturnType<typeof setTimeout>>();

  const showOnce = React.useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setShow(true);
    clearTimeout(hideRef.current);
    // The trigger only fires while the tab is visible, so a fixed linger is
    // enough — no dismissed-too-early-while-locked case to worry about.
    hideRef.current = setTimeout(() => setShow(false), NOTICE_MS);
  }, []);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Date.now() >= new Date(stored).getTime()) showOnce();
    } catch {}
    return () => clearTimeout(hideRef.current);
  }, [showOnce]);

  const applyRoom = React.useCallback(
    (room: Room) => {
      if (room.searchResetsAt) {
        wasOutRef.current = true;
        try {
          localStorage.setItem(STORAGE_KEY, room.searchResetsAt);
        } catch {}
      } else if (wasOutRef.current) {
        wasOutRef.current = false;
        showOnce();
      }
    },
    [showOnce]
  );

  const dismiss = React.useCallback(() => {
    clearTimeout(hideRef.current);
    setShow(false);
  }, []);

  return { show, applyRoom, dismiss };
}
