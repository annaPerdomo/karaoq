import type { DisplayTheme, RoomBrand } from "../pages/api/types";

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** CSS custom properties for the accents a brand sets; an unset accent is left
 *  to the theme. */
export function brandStyle(brand: RoomBrand | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  if (brand?.accentA) {
    style["--acc-a"] = brand.accentA;
    style["--acc-a-rgb"] = hexToRgb(brand.accentA);
  }
  if (brand?.accentB) {
    style["--acc-b"] = brand.accentB;
    style["--acc-b-rgb"] = hexToRgb(brand.accentB);
    style["--acc-warm"] = brand.accentB;
    style["--acc-warm-rgb"] = hexToRgb(brand.accentB);
    style["--acc-c"] = brand.accentB;
    style["--acc-c-rgb"] = hexToRgb(brand.accentB);
  }
  if (brand?.logoScale !== undefined) {
    style["--logo-scale"] = String(brand.logoScale);
  }
  return style;
}

/** The same 2-decimal grid `isValidRoomBrand` accepts; drag handle and server must agree. */
export function roundLogoScale(n: number): number {
  return Math.round(n * 100) / 100;
}

export function brandsEqual(a: RoomBrand, b: RoomBrand): boolean {
  return (
    a.logo === b.logo &&
    a.accentA === b.accentA &&
    a.accentB === b.accentB &&
    a.logoScale === b.logoScale
  );
}

/** Mirrors the theme accents in Display/Host CSS. */
export const THEME_ACCENTS: Record<DisplayTheme, { accentA: string; accentB: string }> = {
  classic: { accentA: "#ff2d78", accentB: "#00f0ff" },
  minimal: { accentA: "#aab0c0", accentB: "#d7dae2" },
  neon: { accentA: "#ff2d78", accentB: "#00f0ff" },
};
