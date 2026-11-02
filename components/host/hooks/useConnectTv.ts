import * as React from "react";
import { PlayMode } from "../../../pages/api/types";
import { ConnectTvLauncherHandle } from "../ConnectTvLauncher";

export function useConnectTv(opts: {
  joinCode: string | undefined;
  message: string;
  showToast: (msg: string) => void;
  setPlayMode: (mode: PlayMode) => void;
  rememberMode: (mode: PlayMode) => void;
}) {
  const { joinCode, message, showToast, setPlayMode, rememberMode } = opts;
  const connectTvRef = React.useRef<ConnectTvLauncherHandle>(null);

  function onTvPaired(r: { roomId: string }) {
    if (r.roomId === joinCode) {
      setPlayMode("tv");
      rememberMode("tv");
      showToast(message);
    }
  }

  return { connectTvRef, onTvPaired };
}
