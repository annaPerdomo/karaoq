/** Not calmMotion(): the compositor workarounds are TV-only, not reduced-motion. */
export function isTvDevice(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.hasAttribute("data-tv");
}

/** Smart TVs never report the preference, so the _document flag stands in.
 * The calm blocks in the stylesheets key off the same two signals. */
export function calmMotion(): boolean {
  if (typeof window === "undefined") return true;
  if (isTvDevice()) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}
