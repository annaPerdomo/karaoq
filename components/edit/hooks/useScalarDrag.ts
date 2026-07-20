import * as React from 'react';
import { useHandleDrag } from './useHandleDrag';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Drag a handle to change one clamped number — the shape every resize in
 * Customize mode takes: the display's QR size and up-next depth, and both
 * surfaces' sidebar width. The value is read at grab time, so the pointer
 * delta is always measured from where the drag started. */
export function useScalarDrag(opts: {
  /** Current value; captured when the drag starts. */
  value: number;
  min: number;
  max: number;
  /** Which pointer travel drives it. 'both' averages dx/dy — a corner resize. */
  axis?: 'x' | 'y' | 'both';
  /** Pixels of travel per unit of value (e.g. one list row's height). */
  scale?: number;
  /** Flip the sign — a sidebar docked right grows when dragged left. */
  invert?: boolean;
  onChange: (next: number) => void;
  onEnd?: () => void;
}) {
  const { value, min, max, axis = 'both', scale = 1, invert = false, onChange, onEnd } = opts;
  const base = React.useRef(0);

  return useHandleDrag({
    onStart: () => {
      base.current = value;
    },
    onMove: (dx, dy) => {
      const travel = axis === 'x' ? dx : axis === 'y' ? dy : (dx + dy) / 2;
      const delta = (invert ? -travel : travel) / scale;
      onChange(clamp(Math.round(base.current + delta), min, max));
    },
    onEnd: () => onEnd?.(),
  });
}
