import * as React from "react";
import { onScreenTest } from "../../../app/queue/roomChannel";
import { Room } from "../../../pages/api/types";

const SHOW_MS = 8000;
// Must stay well above DORMANT_POLL_MS, or a quiet room's slow poll drops the card.
const FRESH_MS = 45_000;
// The host sends a test both ways; the poll that later carries it must not re-show it.
const BROADCAST_DEDUPE_MS = 15_000;

function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Autoplay policy can block audio on a display nobody has touched; the card still shows.
  }
}

export function useScreenTest(joinCode: string | undefined) {
  const [showing, setShowing] = React.useState(false);
  const baselineRef = React.useRef<number | null>(null);
  const lastBroadcastRef = React.useRef(0);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    setShowing(true);
    playChime();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowing(false), SHOW_MS);
  }, []);

  React.useEffect(() => {
    if (!joinCode) return;
    return onScreenTest(joinCode, () => {
      lastBroadcastRef.current = Date.now();
      show();
    });
  }, [joinCode, show]);

  React.useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const adoptRoom = React.useCallback((room: Room) => {
    const at = room.screenTestAt ? new Date(room.screenTestAt).getTime() : 0;
    // First poll only sets the baseline: a test sent before this display opened isn't for it.
    if (baselineRef.current === null) {
      baselineRef.current = at;
      return;
    }
    if (at <= baselineRef.current) return;
    baselineRef.current = at;
    const now = room.serverNow ?? Date.now();
    if (now - at > FRESH_MS) return;
    if (Date.now() - lastBroadcastRef.current < BROADCAST_DEDUPE_MS) return;
    show();
  }, [show]);

  return { showing, adoptRoom };
}
