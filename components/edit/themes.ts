import p from '../../styles/DisplayDesigner.module.css';
import { DisplayTheme } from '../../pages/api/types';

/** The display's palettes, each with its swatch-dot class. Theme classes live in
 * Display.module.css; this is the picker's source of truth. */
export const THEMES: { id: DisplayTheme; dot: string }[] = [
  { id: 'classic', dot: p.swatchClassic },
  { id: 'minimal', dot: p.swatchMinimal },
  { id: 'neon', dot: p.swatchNeon },
];
