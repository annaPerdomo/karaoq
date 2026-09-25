import { PlayMode } from "../../pages/api/types";

export function shouldOfferTvScreen({
  isTv,
  remote,
  access,
  playMode,
  dismissed,
}: {
  isTv: boolean;
  remote: boolean;
  access: "allowed" | "checking" | "locked";
  playMode: PlayMode | null;
  dismissed: boolean;
}): boolean {
  return isTv && !remote && access === "allowed" && playMode !== "tv" && !dismissed;
}
