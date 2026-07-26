import * as React from 'react';
import { useHandleDrag } from './useHandleDrag';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function useScalarDrag(opts: {
  value: number;
  min: number;
  max: number;
  axis?: 'x' | 'y' | 'both';
  /** Pixels of travel per unit of value. */
  scale?: number;
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
