import { withAffiliateTag } from "./guides";

export type GearId =
  | "hdmiCable"
  | "usbcHdmi"
  | "lightningHdmi"
  | "chromecast"
  | "appleTv"
  | "fireTv"
  | "speaker"
  | "stand";

// Searches rather than ASINs, like the guides' gear lists, so a link never goes stale.
const GEAR_SEARCH: Record<GearId, string> = {
  hdmiCable: "hdmi+cable+10+ft",
  usbcHdmi: "usb+c+to+hdmi+adapter",
  lightningHdmi: "apple+lightning+digital+av+adapter",
  chromecast: "google+tv+streamer+chromecast",
  appleTv: "apple+tv+4k",
  fireTv: "fire+tv+stick+4k",
  speaker: "bluetooth+party+speaker",
  stand: "adjustable+tablet+stand",
};

export function gearHref(id: GearId): string {
  return withAffiliateTag(`https://www.amazon.com/s?k=${GEAR_SEARCH[id]}`);
}
