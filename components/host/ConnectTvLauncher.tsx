import * as React from "react";
import { ConnectTvModal } from "./ConnectTvModal";

export interface ConnectTvLauncherHandle {
  open: () => void;
}

export const ConnectTvLauncher = React.forwardRef<
  ConnectTvLauncherHandle,
  {
    joinCode: string;
    onPaired: (r: { kind: "screen" | "remote"; roomId: string }) => void;
  }
>(function ConnectTvLauncher({ joinCode, onPaired }, ref) {
  const [open, setOpen] = React.useState(false);

  React.useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  if (!open) return null;

  return (
    <ConnectTvModal
      roomId={joinCode}
      onClose={() => setOpen(false)}
      onPaired={(r) => {
        setOpen(false);
        onPaired(r);
      }}
    />
  );
});
