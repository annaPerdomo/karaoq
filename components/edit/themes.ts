import p from '../../styles/DisplayDesigner.module.css';
import { DisplayTheme } from '../../pages/api/types';

export const THEMES: { id: DisplayTheme; dot: string }[] = [
  { id: 'classic', dot: p.swatchClassic },
  { id: 'minimal', dot: p.swatchMinimal },
  { id: 'neon', dot: p.swatchNeon },
];
