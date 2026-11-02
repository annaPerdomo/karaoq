import * as React from "react";
import { PlayMode } from "../../../pages/api/types";
import { deviceTypeFromUA } from "../../../lib/deviceType";
import { reportScreenHelp, ScreenHelpOption } from "../../../lib/screenHelp";
import { broadcastScreenTest } from "../../../app/queue/roomChannel";
import postScreenTest from "../../../app/queue/postScreenTest";
import type { StepEvent } from "../screenHelp/ScreenHelpOptionBody";

function verifiedKey(joinCode: string) {
  return `karaoq_screen_ok:${joinCode}`;
}

export function useScreenHelp(opts: {
  joinCode: string | undefined;
  setPlayMode: (mode: PlayMode) => void;
  rememberMode: (mode: PlayMode) => void;
  displayConnected: boolean;
}) {
  const { joinCode, setPlayMode, rememberMode, displayConnected } = opts;
  const [isOpen, setIsOpen] = React.useState(false);
  const [device, setDevice] = React.useState<"tv" | "mobile" | "desktop" | null>(null);
  const [verified, setVerified] = React.useState(false);

  React.useEffect(() => {
    setDevice(deviceTypeFromUA(navigator.userAgent) ?? "desktop");
  }, []);

  React.useEffect(() => {
    if (!joinCode) return;
    try {
      setVerified(sessionStorage.getItem(verifiedKey(joinCode)) === "1");
    } catch {
      // Storage blocked; the person just confirms again.
    }
  }, [joinCode]);

  // A confirmation is about one particular display; once it goes away, the next one has to be checked again.
  const wasConnectedRef = React.useRef(displayConnected);
  React.useEffect(() => {
    if (wasConnectedRef.current && !displayConnected && joinCode) {
      setVerified(false);
      try {
        sessionStorage.removeItem(verifiedKey(joinCode));
      } catch {}
    }
    wasConnectedRef.current = displayConnected;
  }, [displayConnected, joinCode]);

  function open() {
    setIsOpen(true);
    if (joinCode) reportScreenHelp({ roomId: joinCode });
  }

  function close() {
    setIsOpen(false);
  }

  function onOptionOpened(option: ScreenHelpOption) {
    if (joinCode) reportScreenHelp({ roomId: joinCode, option });
  }

  function onStepEvent(e: StepEvent) {
    if (joinCode) reportScreenHelp({ roomId: joinCode, ...e });
  }

  function sendTest() {
    if (!joinCode) return;
    broadcastScreenTest(joinCode);
    postScreenTest(joinCode);
  }

  function markVerified() {
    setVerified(true);
    if (!joinCode) return;
    try {
      sessionStorage.setItem(verifiedKey(joinCode), "1");
    } catch {}
  }

  function useDisplayMode() {
    setPlayMode("tv");
    rememberMode("tv");
  }

  return { isOpen, device, verified, open, close, onOptionOpened, onStepEvent, sendTest, markVerified, useDisplayMode };
}
