import { deviceTypeFromUA, platformFromUA } from "./deviceType";

export type ScreenHelpOption = "pair" | "mirror" | "laptop" | "popout" | "onTv";
export type MirrorKind = "airplay" | "cast";

export interface ScreenHelpPlan {
  device: "tv" | "mobile" | "desktop";
  options: ScreenHelpOption[];
  mirror: MirrorKind;
}

export const SCREEN_HELP_OPTIONS: readonly ScreenHelpOption[] = [
  "pair",
  "mirror",
  "laptop",
  "popout",
  "onTv",
];

const AIRPLAY_PLATFORMS = new Set(["iPhone", "iPad", "Mac"]);

export function screenHelpPlan(ua: string | null | undefined): ScreenHelpPlan {
  const device = deviceTypeFromUA(ua) ?? "desktop";
  const platform = platformFromUA(ua);
  const mirror: MirrorKind = platform && AIRPLAY_PLATFORMS.has(platform) ? "airplay" : "cast";

  const options: ScreenHelpOption[] =
    device === "tv"
      ? ["onTv"]
      : device === "mobile"
        ? ["pair", "mirror", "laptop"]
        : ["popout", "pair", "mirror"];

  return { device, options, mirror };
}

export function reportScreenHelp(body: {
  roomId: string;
  option?: ScreenHelpOption;
}): void {
  fetch("/api/analytics/screen-help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
