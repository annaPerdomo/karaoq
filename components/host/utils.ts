// Re-exported so the host files that already import it here keep working —
// the implementation is shared app-wide in lib/decodeHtml.
export { default as decodeHtml } from "../../lib/decodeHtml";

export function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}
