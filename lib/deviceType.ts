/** One reading of a User-Agent, shared by the Mongo aggregation in
 *  /api/analytics/data, the inline script in _document, and anything reading a
 *  stored UA in JS. They must agree, so the patterns live only here. */

export type DeviceType = "tv" | "mobile" | "desktop";

/** Living-room devices. Checked FIRST: most also say "Android" and several say
 *  "Mobile Safari", so an Android TV read as a phone is the bug this prevents.
 *
 *  The pattern stays case-insensitive — `(?-i:…)` around the uppercase Fire TV
 *  codes would throw on the Chrome-108 sets it exists to recognise — so its \b
 *  is what keeps "craft" and "shaft" out. A model named "after" still reads as
 *  a TV; that is the accepted residual. */
export const TV_PATTERN =
  /SMART-TV|SmartTV|SmartTvA|HbbTV|NetCast|webOS|Web0S|Tizen|BRAVIA|VIDAA|Viera|AQUOS|TiVoOS|Opera TV|NETTV|POV_TV|PhilipsTV|AndroidTV|Android TV|GoogleTV|Google TV|CrKey|\bAFT[A-Z]{1,3}\b|Roku|PlayStation|Xbox|Nintendo|\bTV Safari|\bTV\b.*\bSafari/i;

/** Everything handheld. Only consulted once TV_PATTERN has said no. */
export const MOBILE_PATTERN = /Mobile|Android|iPhone|iPad|iPod/i;

/** Which living-room platform, for the breakdown under the device split.
 *  Ordered most-specific first: a Fire TV stick also says "Android". */
const TV_PLATFORMS: [string, RegExp][] = [
  ["LG", /NetCast|webOS|Web0S/i],
  ["Samsung", /Tizen|SMART-TV/i],
  ["Sony", /BRAVIA/i],
  ["Hisense", /VIDAA/i],
  ["Panasonic", /Viera/i],
  ["Sharp", /AQUOS/i],
  ["Philips", /PhilipsTV|NETTV/i],
  ["Fire TV", /\bAFT[A-Z]{1,3}\b/i],
  ["Chromecast", /CrKey/i],
  ["Roku", /Roku/i],
  ["Console", /PlayStation|Xbox|Nintendo/i],
  ["Vestel", /TiVoOS|SmartTvA|Vestel/i],
  // The last alternative catches unbranded panels, whose only tell is a
  // "Smart TV" model in an ordinary Android UA. Safe this far down: LG's UA
  // also says "SmartTV" and matched on NetCast above.
  ["Android TV", /AndroidTV|Android TV|GoogleTV|Google TV|Android [\d.]+; Smart ?TV/i],
];

export function deviceTypeFromUA(ua: string | null | undefined): DeviceType | null {
  if (!ua) return null;
  if (TV_PATTERN.test(ua)) return "tv";
  if (MOBILE_PATTERN.test(ua)) return "mobile";
  return "desktop";
}

/** Handheld and desktop platforms, most-specific first. Only consulted once
 *  TV_PATTERN has said no, so "Android" here can't be a television. */
const PLATFORMS: [string, RegExp][] = [
  ["iPhone", /iPhone|iPod/i],
  ["iPad", /iPad/i],
  // iPadOS 13+ reports itself as a Mac and the only tell is a touch-point
  // count no stored UA has, so such an iPad lands in "Mac".
  ["Android", /Android/i],
  ["Chromebook", /CrOS/i],
  ["Mac", /Macintosh|Mac OS X/i],
  ["Windows", /Windows/i],
  ["Linux", /Linux|X11/i],
];

export function platformFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const tv = tvPlatformFromUA(ua);
  // "LG" reads better as "LG TV", but "Android TV", "Fire TV" and "Other TV"
  // already say it and "Console" isn't one.
  if (tv) return /TV$/.test(tv) || tv === "Console" ? tv : `${tv} TV`;
  for (const [name, pattern] of PLATFORMS) {
    if (pattern.test(ua)) return name;
  }
  return "Other";
}

export function tvPlatformFromUA(ua: string | null | undefined): string | null {
  if (!ua || !TV_PATTERN.test(ua)) return null;
  for (const [name, pattern] of TV_PLATFORMS) {
    if (pattern.test(ua)) return name;
  }
  return "Other TV";
}
