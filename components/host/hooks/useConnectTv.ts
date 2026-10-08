import * as React from "react";
import { useRouter } from "next/router";
import { PlayMode } from "../../../pages/api/types";
import { rememberLastHostedRoom } from "../../../lib/lastRoom";
import { ConnectTvLauncherHandle } from "../ConnectTvLauncher";

export function useConnectTv(opts: {
  joinCode: string | undefined;
  message: string;
  showToast: (msg: string) => void;
  setPlayMode: (mode: PlayMode) => void;
  rememberMode: (mode: PlayMode) => void;
}) {
  const { joinCode, message, showToast, setPlayMode, rememberMode } = opts;
  const router = useRouter();
  const connectTvRef = React.useRef<ConnectTvLauncherHandle>(null);

  function onTvPaired(r: { kind: "screen" | "remote"; roomId: string }) {
    if (r.kind === "remote") {
      rememberLastHostedRoom(r.roomId);
      return router.push(`/host/${r.roomId}?paired=1`);
    }
    if (r.roomId === joinCode) {
      setPlayMode("tv");
      rememberMode("tv");
      showToast(message);
    }
  }

  return { connectTvRef, onTvPaired };
}
