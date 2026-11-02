import { describe, it, expect } from "vitest";
import { screenHelpPlan, ConnectMethod, SCREEN_HELP_OPTIONS } from "../../lib/screenHelp";
import { screenHelpFlow, STEP_ID_PATTERN } from "../../lib/screenHelpSteps";
import en from "../../lib/i18n/en.json";

const MAC = screenHelpPlan("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36");
const IPHONE = screenHelpPlan("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1");
const METHODS: ConnectMethod[] = ["cable", "airplay", "chromecast", "miracast"];
const catalog = en as Record<string, string>;

describe("screenHelpFlow", () => {
  it("every step of every route has a valid id and English copy for its text and fix", () => {
    for (const plan of [MAC, IPHONE]) {
      for (const option of SCREEN_HELP_OPTIONS) {
        for (const method of METHODS) {
          for (const cast of [false, true]) {
            const flow = screenHelpFlow(option, plan, method, cast);
            if (!flow) continue;
            for (const step of flow.steps) {
              expect(step.id).toMatch(STEP_ID_PATTERN);
              expect(catalog[step.text], step.text).toBeTruthy();
              if (step.fix) expect(catalog[step.fix], step.fix).toBeTruthy();
            }
            if (flow.verifyFix) expect(catalog[flow.verifyFix], flow.verifyFix).toBeTruthy();
          }
        }
      }
    }
  });

  it("the computer route opens the window, then checks it moved and went fullscreen", () => {
    const flow = screenHelpFlow("popout", MAC, "cable", false)!;
    expect(flow.steps.map((s) => s.signal ?? null)).toEqual(["extended", null, "extended", "popupOpen", "popupOtherScreen", "popupFullscreen"]);
    expect(flow.finish).toBe("test");
  });

  it("a reachable Chromecast collapses the cast route to one button", () => {
    const flow = screenHelpFlow("popout", MAC, "chromecast", true)!;
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0].action).toBe("cast");
  });

  it("routes onto another device tick off their first step when the display goes live", () => {
    expect(screenHelpFlow("laptop", IPHONE, "airplay", false)!.steps[0].signal).toBe("displayConnected");
    expect(screenHelpFlow("standalone", IPHONE, "cable", false)!.steps[0].signal).toBe("displayConnected");
  });

  it("mirroring asks rather than tests, and pairing ends in the code form", () => {
    expect(screenHelpFlow("mirror", IPHONE, "cable", false)!.finish).toBe("mirror");
    const pair = screenHelpFlow("pair", IPHONE, "cable", false)!;
    expect(pair.finish).toBe("paired");
    expect(pair.steps.at(-1)!.action).toBe("pairForm");
    expect(screenHelpFlow("onTv", IPHONE, "cable", false)).toBeNull();
  });
});
