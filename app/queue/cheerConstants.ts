export const CHEER_EMOJIS = [
  '\u{1F525}', '\u{1F44F}', '\u{2764}\u{FE0F}', '\u{1F3A4}',
  '\u{2B50}', '\u{1F64C}', '\u{1F929}', '\u{1F483}',
  '\u{1F3B5}', '\u{1F3B6}',
];

export const CHEER_MESSAGES = [
  'Amazing!', 'You rock!', 'Encore!', 'Wooo!', 'Nailed it!',
];

export const REACTION_COOLDOWN_MS = 3000;

/** Distinguishes message reactions ("Encore!") from emoji ones for styling. */
export function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}
