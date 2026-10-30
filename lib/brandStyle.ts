import type { RoomBrand } from "../pages/api/types";

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** CSS custom properties for the accents a brand sets; an unset accent is left
 *  to the theme. */
export function brandStyle(brand: RoomBrand | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  if (brand?.accentA) style["--acc-a"] = brand.accentA;
  if (brand?.accentB) {
    style["--acc-b"] = brand.accentB;
    style["--acc-b-rgb"] = hexToRgb(brand.accentB);
  }
  return style;
}
