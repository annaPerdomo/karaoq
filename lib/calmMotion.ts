/** Smart TVs never report the preference, so the _document flag stands in.
 * The calm blocks in the stylesheets key off the same two signals. */
export function calmMotion(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.hasAttribute("data-tv")) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}
