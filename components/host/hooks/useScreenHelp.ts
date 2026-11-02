import * as React from "react";
import { PlayMode } from "../../../pages/api/types";
import { deviceTypeFromUA } from "../../../lib/deviceType";
import { reportScreenHelp, ScreenHelpOption } from "../../../lib/screenHelp";

export function useScreenHelp(opts: {
  joinCode: string | undefined;
  setPlayMode: (mode: PlayMode) => void;
  rememberMode: (mode: PlayMode) => void;
}) {
  const { joinCode, setPlayMode, rememberMode } = opts;
  const [isOpen, setIsOpen] = React.useState(false);
  const [device, setDevice] = React.useState<"tv" | "mobile" | "desktop" | null>(null);

  React.useEffect(() => {
    setDevice(deviceTypeFromUA(navigator.userAgent) ?? "desktop");
  }, []);

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

  function useDisplayMode() {
    setPlayMode("tv");
    rememberMode("tv");
  }

  return { isOpen, device, open, close, onOptionOpened, useDisplayMode };
}
