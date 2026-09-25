import * as React from "react";
import { createPairing } from "../../../app/pairing/createPairing";
import { pollPairing } from "../../../app/pairing/pollPairing";
import { PAIR_TTL_MS } from "../../../lib/pairing";

const POLL_MS = 2000;
const CLAIMED_HOLD_MS = 4000;

export type ConnectPhoneStage = "creating" | "showing" | "claimed" | "expired" | "error";

export function useConnectPhone(joinCode: string | undefined, editing = false) {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<ConnectPhoneStage>("creating");
  const [pairing, setPairing] = React.useState<{ code: string; secret: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  // Computed once on arrival, then re-diffed every tick — never expiresAt
  // minus Date.now(), which drifts when the tab was backgrounded.
  const deadlineRef = React.useRef(0);
  const creatingRef = React.useRef(false);
  const generationRef = React.useRef(0);

  const create = React.useCallback(async () => {
    if (!joinCode || creatingRef.current) return;
    creatingRef.current = true;
    const generation = ++generationRef.current;
    setStage("creating");
    const created = await createPairing("remote", joinCode);
    creatingRef.current = false;
    if (generation !== generationRef.current) return;
    if (!created) {
      setStage("error");
      return;
    }
    deadlineRef.current = performance.now() + PAIR_TTL_MS;
    setSecondsLeft(Math.round(PAIR_TTL_MS / 1000));
    setPairing({ code: created.code, secret: created.secret });
    setStage("showing");
  }, [joinCode]);

  const openPanel = React.useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) create();
      return true;
    });
  }, [create]);

  const close = React.useCallback(() => {
    generationRef.current += 1;
    creatingRef.current = false;
    setOpen(false);
    setPairing(null);
  }, []);

  // Entering Customize must not leave the code live off-screen behind it.
  React.useEffect(() => {
    if (editing) close();
  }, [editing, close]);

  // Restores remote focus to the button on close; a TV remote would otherwise strand it on the closed panel.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (wasOpenRef.current && !open) {
      document.querySelector<HTMLElement>('[data-remote="connect-phone"]')?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (stage !== "showing") return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((deadlineRef.current - performance.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [stage]);

  React.useEffect(() => {
    if (!open || stage !== "showing" || !pairing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = true;
      const result = await pollPairing(pairing!.code, pairing!.secret);
      inFlight = false;
      if (cancelled) return;
      if (result.status === "claimed") {
        setStage("claimed");
        return;
      }
      if (result.status === "expired") {
        setStage("expired");
        return;
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (cancelled || document.hidden) return;
      timer = setTimeout(poll, POLL_MS);
    }

    function onVisibilityChange() {
      if (document.hidden || cancelled) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      poll();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [open, stage, pairing]);

  React.useEffect(() => {
    if (stage !== "claimed") return;
    const id = setTimeout(close, CLAIMED_HOLD_MS);
    return () => clearTimeout(id);
  }, [stage, close]);

  return { open, stage, code: pairing?.code ?? "", secondsLeft, openPanel, close, retry: create };
}
