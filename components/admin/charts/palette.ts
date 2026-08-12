// Chart color roles for the admin. The categorical order is a validated set
// (CVD-safe adjacency, ≥3:1 contrast on the card surface #1a1a2e) — assign
// slots in order, never cycle past the end, and never repaint survivors when a
// filter removes a series. UI chrome stays on the brand purple; these hues are
// reserved for data marks.
export const SERIES = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
] as const;

export const SERIES_1 = SERIES[0];

// Status is a fixed scale with reserved meaning (never a series color), always
// paired with a label so color never carries state alone.
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export type StatusTone = keyof typeof STATUS;

// Sequential blue, low → high. On this dark surface "near zero" recedes toward
// the surface (darkest step) and the maximum is the brightest.
export const SEQUENTIAL = [
  '#104281',
  '#1c5cab',
  '#2a78d6',
  '#5598e7',
  '#86b6ef',
] as const;

/** Bucket a value into the sequential ramp; zero stays off the ramp entirely. */
export function sequentialColor(value: number, max: number): string | null {
  if (value <= 0 || max <= 0) return null;
  const step = Math.min(
    SEQUENTIAL.length - 1,
    Math.floor((value / max) * SEQUENTIAL.length)
  );
  return SEQUENTIAL[step];
}
