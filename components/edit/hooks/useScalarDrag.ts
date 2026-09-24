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
  step?: number;
  onChange: (next: number) => void;
  onEnd?: () => void;
}) {
  const {
    value,
    min,
    max,
    axis = 'both',
    scale = 1,
    invert = false,
    step = 8,
    onChange,
    onEnd,
  } = opts;
  const base = React.useRef(0);

  const dragProps = useHandleDrag({
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

  // One commit per keypress, same as onEnd after a finished drag.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const increasing =
      axis === 'y' ? ['ArrowDown'] : axis === 'x' ? ['ArrowRight'] : ['ArrowRight', 'ArrowDown'];
    const decreasing =
      axis === 'y' ? ['ArrowUp'] : axis === 'x' ? ['ArrowLeft'] : ['ArrowLeft', 'ArrowUp'];

    let next: number;
    if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (increasing.includes(e.key)) next = clamp(value + (invert ? -step : step), min, max);
    else if (decreasing.includes(e.key)) next = clamp(value - (invert ? -step : step), min, max);
    else return;

    e.preventDefault();
    e.stopPropagation();
    onChange(next);
    onEnd?.();
  };

  return {
    ...dragProps,
    onKeyDown,
    tabIndex: 0,
    role: 'slider' as const,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': value,
    'aria-orientation': (axis === 'both' ? undefined : axis === 'x' ? 'horizontal' : 'vertical') as
      | 'horizontal'
      | 'vertical'
      | undefined,
  };
}
