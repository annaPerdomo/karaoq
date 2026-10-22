import * as React from "react";

import { Room } from "../../pages/api/types";

// Survives the night: a phone that saw quota-out and only comes back tomorrow
// still gets told, once, that search recovered. Versioned: values stored under
// the old ledger-arithmetic flag were mostly false outages and must not announce.
const STORAGE_KEY = "karaoq_search_quota_out_v2";
const LEGACY_STORAGE_KEY = "karaoq_search_quota_out";
export const NOTICE_MS = 12_000;
const DAY_MS = 24 * 60 * 60_000;

/**
 * Tells a room that spent the evening pasting links when song search works
 * again. Feed every room snapshot through `applyRoom`; the notice fires on
 * the poll where the server's quota-out flag disappears — midnight with the
 * page open, or the next glance at the tab (polling pauses while hidden).
 * On mount, a stored reset time within the past day arms the notice for
 * singers who reopen the page after the reset; it still waits for the first
 * snapshot to confirm search is back before firing.
 */
export function useSearchBackNotice() {
  const [show, setShow] = React.useState(false);
  const wasOutRef = React.useRef(false);
  const pendingRef = React.useRef(false);
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
      // A stored reset time in the past usually means search recovered while
      // this phone was away — but not always (quota can be out again today,
      // or the phone's clock can run fast), so arm the notice and let the
      // first room snapshot decide instead of firing here.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const sinceReset = Date.now() - new Date(stored).getTime();
        if (sinceReset >= DAY_MS || Number.isNaN(sinceReset))
          localStorage.removeItem(STORAGE_KEY);
        else if (sinceReset >= 0) pendingRef.current = true;
      }
    } catch {}
    return () => clearTimeout(hideRef.current);
  }, []);

  const applyRoom = React.useCallback(
    (room: Room) => {
      if (room.searchResetsAt) {
        wasOutRef.current = true;
        pendingRef.current = false;
        try {
          localStorage.setItem(STORAGE_KEY, room.searchResetsAt);
        } catch {}
        // "Search is back" mid-linger is now a lie — pull it.
        clearTimeout(hideRef.current);
        setShow(false);
      } else if (wasOutRef.current || pendingRef.current) {
        wasOutRef.current = false;
        pendingRef.current = false;
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
