import { ComputerOs, ConnectMethod, ScreenHelpOption, ScreenHelpPlan } from "./screenHelp";

export type StepSignal =
  | "extended"
  | "popupOpen"
  | "popupOtherScreen"
  | "popupFullscreen"
  | "displayConnected";

export type StepAction = "openDisplay" | "cast" | "pairForm";

export interface StepSpec {
  /** Stable id for analytics; must match STEP_ID_PATTERN. */
  id: string;
  /** i18n key; may contain {url}. */
  text: string;
  action?: StepAction;
  signal?: StepSignal;
  /** i18n key. */
  fix?: string;
}

/** "mirror" can't send a test card (the big screen shows this page), so it only asks. */
export type FlowFinish = "test" | "mirror" | "paired";

export interface Flow {
  steps: StepSpec[];
  finish: FlowFinish;
  needsDisplay: boolean;
  verifyFix?: string;
}

export const STEP_ID_PATTERN = /^[a-z][a-zA-Z.]{0,31}$/;

const OPEN: StepSpec = { id: "open", text: "screenHelp.popout.open", action: "openDisplay", signal: "popupOpen", fix: "screenHelp.fix.popupBlocked" };
const DRAG: StepSpec = { id: "drag", text: "screenHelp.popout.drag", signal: "popupOtherScreen", fix: "screenHelp.fix.drag" };
const FULLSCREEN: StepSpec = { id: "fullscreen", text: "screenHelp.popout.fullscreen", signal: "popupFullscreen", fix: "screenHelp.fix.fullscreen" };
const INPUT: StepSpec = { id: "input", text: "screenHelp.connect.cable.input", fix: "screenHelp.fix.input" };
const AIRPLAY_PICK: StepSpec = { id: "airplay.pick", text: "screenHelp.connect.airplay.pick", fix: "screenHelp.fix.airplayMissing" };

function extendStep(os: ComputerOs): StepSpec {
  return { id: "extend", text: `screenHelp.connect.extend.${os}`, signal: "extended", fix: "screenHelp.fix.extend" };
}

function thisComputerFlow(method: ConnectMethod, os: ComputerOs, castAvailable: boolean): Flow {
  const finish = { finish: "test" as const, needsDisplay: true, verifyFix: "screenHelp.fix.verify.popout" };
  if (method === "chromecast") {
    if (castAvailable) {
      return {
        ...finish,
        steps: [{ id: "cast.oneClick", text: "screenHelp.popout.castOneClick", action: "cast", signal: "displayConnected", fix: "screenHelp.fix.castPicker" }],
      };
    }
    return {
      ...finish,
      steps: [
        { id: "wifi", text: "screenHelp.connect.wifi.this", fix: "screenHelp.fix.wifi" },
        OPEN,
        { id: "cast.menu", text: "screenHelp.popout.cast", fix: "screenHelp.fix.castMenu" },
      ],
    };
  }
  const connect: StepSpec[] =
    method === "cable"
      ? [{ id: "cable.plug", text: "screenHelp.connect.cable.plug", signal: "extended", fix: "screenHelp.fix.cablePlug" }, INPUT, extendStep(os)]
      : method === "airplay"
        ? [
            { id: "wifi", text: "screenHelp.connect.wifi.this", fix: "screenHelp.fix.wifi" },
            { id: "airplay.open", text: "screenHelp.connect.airplay.this", fix: "screenHelp.fix.airplayMenuMac" },
            { ...AIRPLAY_PICK, signal: "extended" },
            extendStep("mac"),
          ]
        : [
            { id: "miracast", text: "screenHelp.connect.miracast.open", signal: "extended", fix: "screenHelp.fix.miracast" },
            extendStep("windows"),
          ];
  return { ...finish, steps: [...connect, OPEN, DRAG, FULLSCREEN] };
}

function otherDeviceFlow(method: ConnectMethod): Flow {
  const open: StepSpec = { id: "laptop.open", text: "screenHelp.laptop.open", signal: "displayConnected", fix: "screenHelp.fix.url" };
  const connect: StepSpec[] =
    method === "cable"
      ? [{ id: "cable.plug", text: "screenHelp.connect.cable.plugOther", fix: "screenHelp.fix.cablePlug" }, INPUT]
      : method === "airplay"
        ? [
            { id: "wifi", text: "screenHelp.connect.wifi.other", fix: "screenHelp.fix.wifi" },
            { id: "airplay.open", text: "screenHelp.connect.airplay.other", fix: "screenHelp.fix.airplayMenuOther" },
            AIRPLAY_PICK,
          ]
        : [
            { id: "wifi", text: "screenHelp.connect.wifi.other", fix: "screenHelp.fix.wifi" },
            { id: "cast.menu", text: "screenHelp.connect.chromecast.other", fix: "screenHelp.fix.castMenu" },
          ];
  // A cast tab already fills the screen; a cable or AirPlay shows the whole desktop.
  const fullscreen: StepSpec[] =
    method === "chromecast" ? [] : [{ id: "fullscreen", text: "screenHelp.laptop.fullscreen", fix: "screenHelp.fix.fullscreen" }];
  return {
    steps: [open, ...connect, ...fullscreen],
    finish: "test",
    needsDisplay: true,
    verifyFix: "screenHelp.fix.verify.other",
  };
}

export function screenHelpFlow(
  option: ScreenHelpOption,
  plan: ScreenHelpPlan,
  method: ConnectMethod,
  castAvailable: boolean
): Flow | null {
  switch (option) {
    case "popout":
      return thisComputerFlow(method, plan.os, castAvailable);
    case "laptop":
      return otherDeviceFlow(method);
    case "standalone":
      return {
        steps: [
          { id: "standalone.open", text: "screenHelp.standalone.open", signal: "displayConnected", fix: "screenHelp.fix.url" },
          { id: "standalone.fullscreen", text: "screenHelp.standalone.fullscreen", fix: "screenHelp.fix.fullscreen" },
          { id: "standalone.sound", text: "screenHelp.standalone.sound", fix: "screenHelp.fix.sound" },
        ],
        finish: "test",
        needsDisplay: true,
        verifyFix: "screenHelp.fix.verify.other",
      };
    case "mirror":
      return {
        steps: [
          { id: "wifi", text: "screenHelp.mirror.wifi", fix: "screenHelp.fix.wifi" },
          { id: "mirror.open", text: `screenHelp.mirror.${plan.mirror}.open`, fix: `screenHelp.fix.mirrorMenu.${plan.mirror}` },
          { id: "mirror.pick", text: `screenHelp.mirror.${plan.mirror}.pick`, fix: "screenHelp.fix.mirrorMissing" },
        ],
        finish: "mirror",
        needsDisplay: false,
        verifyFix: "screenHelp.fix.verify.mirror",
      };
    case "pair":
      return {
        steps: [
          { id: "pair.browser", text: "screenHelp.pair.browser", fix: "screenHelp.fix.noBrowser" },
          { id: "pair.go", text: "screenHelp.pair.go", fix: "screenHelp.fix.tvTyping" },
          { id: "pair.choose", text: "screenHelp.pair.step2", fix: "screenHelp.fix.pairChoose" },
          { id: "pair.code", text: "screenHelp.pair.step3", action: "pairForm", fix: "screenHelp.fix.pairCode" },
        ],
        finish: "paired",
        needsDisplay: false,
      };
    default:
      return null;
  }
}
