import * as React from "react";

export interface PopupState {
  open: boolean;
  /** null: this browser can't tell which screen a window is on. */
  otherScreen: boolean | null;
  fullscreen: boolean;
}

export interface ScreenSignals {
  /** null where screen.isExtended is unsupported (Safari, Firefox). */
  extended: boolean | null;
  popup: PopupState;
  airplayNearby: boolean | null;
  castAvailable: boolean;
}

type ScreenWithPos = Screen & { availLeft?: number; availTop?: number; isExtended?: boolean };

interface PresentationRequestLike {
  getAvailability(): Promise<{ value: boolean; onchange: (() => void) | null }>;
  start(): Promise<unknown>;
}

const POPUP_POLL_MS = 800;
const CLOSED_POPUP: PopupState = { open: false, otherScreen: null, fullscreen: false };

function readPopup(w: Window | null): PopupState {
  if (!w || w.closed) return CLOSED_POPUP;
  try {
    const hs = window.screen as ScreenWithPos;
    const ps = w.screen as ScreenWithPos;
    // Each window's `screen` is the one it currently sits on, so a different origin or size means it moved.
    const otherScreen =
      typeof hs.availLeft === "number" && typeof ps.availLeft === "number"
        ? hs.availLeft !== ps.availLeft || hs.availTop !== ps.availTop || hs.width !== ps.width || hs.height !== ps.height
        : null;
    // Covers both the page's Fullscreen button and the browser's own fullscreen (F11, Ctrl+Cmd+F).
    const fullscreen =
      !!w.document.fullscreenElement || (w.innerWidth >= ps.width - 4 && w.innerHeight >= ps.height - 4);
    return { open: true, otherScreen, fullscreen };
  } catch {
    return { open: true, otherScreen: null, fullscreen: false };
  }
}

function samePopup(a: PopupState, b: PopupState) {
  return a.open === b.open && a.otherScreen === b.otherScreen && a.fullscreen === b.fullscreen;
}

export function useScreenSignals(opts: {
  active: boolean;
  getDisplayWindow: () => Window | null;
  displayUrl: string;
}) {
  const { active, getDisplayWindow, displayUrl } = opts;
  const [extended, setExtended] = React.useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const s = window.screen as ScreenWithPos;
    return typeof s.isExtended === "boolean" ? s.isExtended : null;
  });
  const [popup, setPopup] = React.useState<PopupState>(CLOSED_POPUP);
  const [airplayNearby, setAirplayNearby] = React.useState<boolean | null>(null);
  const [castAvailable, setCastAvailable] = React.useState(false);
  const requestRef = React.useRef<PresentationRequestLike | null>(null);
  // Held so the presentation isn't torn down with an unreferenced connection.
  const connectionRef = React.useRef<unknown>(null);
  const getWindowRef = React.useRef(getDisplayWindow);
  getWindowRef.current = getDisplayWindow;

  React.useEffect(() => {
    if (!active) return;
    const s = window.screen as ScreenWithPos;
    if (typeof s.isExtended !== "boolean") return;
    const sync = () => setExtended(!!s.isExtended);
    sync();
    const target = s as unknown as Partial<EventTarget>;
    if (typeof target.addEventListener !== "function") return;
    target.addEventListener("change", sync);
    return () => target.removeEventListener?.("change", sync);
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    const tick = () => {
      const next = readPopup(getWindowRef.current());
      setPopup((prev) => (samePopup(prev, next) ? prev : next));
    };
    tick();
    const id = setInterval(tick, POPUP_POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  React.useEffect(() => {
    if (!active || !("WebKitPlaybackTargetAvailabilityEvent" in window)) return;
    // Safari only reports AirPlay targets to a media element that allows AirPlay; it never plays.
    const video = document.createElement("video");
    video.setAttribute("x-webkit-airplay", "allow");
    video.style.display = "none";
    const onChange = (e: Event) => setAirplayNearby((e as Event & { availability?: string }).availability === "available");
    video.addEventListener("webkitplaybacktargetavailabilitychanged", onChange);
    document.body.appendChild(video);
    return () => {
      video.removeEventListener("webkitplaybacktargetavailabilitychanged", onChange);
      video.remove();
    };
  }, [active]);

  React.useEffect(() => {
    const Ctor = (window as unknown as { PresentationRequest?: new (urls: string[]) => PresentationRequestLike }).PresentationRequest;
    if (!active || !Ctor || !displayUrl) return;
    let cancelled = false;
    let availability: { value: boolean; onchange: (() => void) | null } | null = null;
    try {
      const request = new Ctor([displayUrl]);
      requestRef.current = request;
      request
        .getAvailability()
        .then((av) => {
          if (cancelled) return;
          availability = av;
          setCastAvailable(av.value);
          av.onchange = () => setCastAvailable(av.value);
        })
        .catch(() => {});
    } catch {
      // Unsupported URL or browser; casting stays a manual step.
    }
    return () => {
      cancelled = true;
      if (availability) availability.onchange = null;
    };
  }, [active, displayUrl]);

  const startCast = React.useCallback(async () => {
    if (!requestRef.current) return false;
    try {
      connectionRef.current = await requestRef.current.start();
      return true;
    } catch {
      return false;
    }
  }, []);

  const signals: ScreenSignals = { extended, popup, airplayNearby, castAvailable };
  return { signals, startCast };
}
