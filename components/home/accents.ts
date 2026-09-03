import type * as React from 'react';

/**
 * Every accent paired with its rgb components, because Home.module.css backs
 * each color-mix() with an rgba(var(--accent-rgb), …) fallback for pre-Chrome-111
 * TVs. Setting --accent alone looks right on every browser but those.
 */
const ACCENT_RGB = {
  '#06b6d4': '6, 182, 212',
  '#a855f7': '168, 85, 247',
  '#ec4899': '236, 72, 153',
  '#f97316': '249, 115, 22',
  '#10b981': '16, 185, 129',
  '#3b82f6': '59, 130, 246',
} as const;

export type AccentHex = keyof typeof ACCENT_RGB;

export function accent(hex: AccentHex): React.CSSProperties {
  return { '--accent': hex, '--accent-rgb': ACCENT_RGB[hex] } as React.CSSProperties;
}
