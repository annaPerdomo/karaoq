/** Sections of the display edit mode can select and edit — the real page
 * elements themselves, not copies. */
export type SectionId =
  | 'qr'
  | 'upNext'
  | 'nowPlaying'
  | 'banner'
  | 'boards';

// The Spot/HideButton primitives are shared with the host's Customize mode.
export { Spot, HideButton } from '../../edit/EditChrome';
