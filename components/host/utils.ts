export { default as formatSongTitle } from "../../lib/songTitle";

export function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}
