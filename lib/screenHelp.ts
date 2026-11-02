import { deviceTypeFromUA, platformFromUA } from "./deviceType";

export type ScreenHelpOption = "pair" | "mirror" | "laptop" | "standalone" | "popout" | "onTv";
export type MirrorKind = "airplay" | "cast";
export type ComputerOs = "mac" | "windows" | "other";
export type ConnectMethod = "cable" | "airplay" | "chromecast" | "miracast";
/** "this": the host is the computer. "other": the host is a phone and the computer is someone else's. */
export type ConnectScope = "this" | "other";

export interface ScreenHelpPlan {
  device: "tv" | "mobile" | "desktop";
  options: ScreenHelpOption[];
  mirror: MirrorKind;
  os: ComputerOs;
}

export const SCREEN_HELP_OPTIONS: readonly ScreenHelpOption[] = [
  "pair",
  "mirror",
  "laptop",
  "standalone",
  "popout",
  "onTv",
];

const AIRPLAY_PLATFORMS = new Set(["iPhone", "iPad", "Mac"]);

/** `touchPoints` is navigator.maxTouchPoints: iPadOS Safari sends a Mac UA, and touch is the only tell. */
export function screenHelpPlan(ua: string | null | undefined, touchPoints = 0): ScreenHelpPlan {
  const uaPlatform = platformFromUA(ua);
  const isIpadAsMac = uaPlatform === "Mac" && touchPoints > 1;
  const device = isIpadAsMac ? "mobile" : deviceTypeFromUA(ua) ?? "desktop";
  const platform = isIpadAsMac ? "iPad" : uaPlatform;
  const mirror: MirrorKind = platform && AIRPLAY_PLATFORMS.has(platform) ? "airplay" : "cast";
  const os: ComputerOs = platform === "Mac" ? "mac" : platform === "Windows" ? "windows" : "other";

  const options: ScreenHelpOption[] =
    device === "tv"
      ? ["onTv"]
      : device === "mobile"
        ? ["pair", "mirror", "laptop", "standalone"]
        : ["popout", "pair", "mirror"];

  return { device, options, mirror, os };
}

/** "other": the computer's OS is unknown, so Windows-only Miracast is left out. */
export function connectMethods(scope: ConnectScope, os: ComputerOs): ConnectMethod[] {
  if (scope === "other") return ["cable", "airplay", "chromecast"];
  if (os === "mac") return ["cable", "airplay", "chromecast"];
  if (os === "windows") return ["cable", "chromecast", "miracast"];
  return ["cable", "chromecast"];
}

export const CONNECT_METHODS: readonly ConnectMethod[] = ["cable", "airplay", "chromecast", "miracast"];
export const STEP_OUTCOMES = ["stuck", "verified", "failed"] as const;
export type StepOutcome = (typeof STEP_OUTCOMES)[number];

export function reportScreenHelp(body: {
  roomId: string;
  option?: ScreenHelpOption | "quickCheck";
  method?: ConnectMethod;
  step?: string;
  outcome?: StepOutcome;
}): void {
  fetch("/api/analytics/screen-help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
