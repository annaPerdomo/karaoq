import * as React from 'react';

interface CanvasDragCallbacks {
  onStart?: () => void;
  /** Deltas are in canvas (pre-scale) pixels; the raw event is included for
   * interactions that need absolute pointer coordinates (e.g. reordering). */
  onMove: (dx: number, dy: number, e: React.PointerEvent) => void;
  onEnd: () => void;
}

/** Pointer-capture drag for handles inside the scaled TV canvas. Deltas are
 * divided by the canvas scale so a 1px on-screen move maps to the real pixels
 * the display will use. Spread the returned props onto the handle element. */
export function useCanvasDrag(scale: number, cb: CanvasDragCallbacks) {
  const start = React.useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY };
      cb.onStart?.();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      cb.onMove((e.clientX - start.current.x) / scale, (e.clientY - start.current.y) / scale, e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return;
      start.current = null;
      e.stopPropagation();
      cb.onEnd();
    },
    onPointerCancel: () => {
      if (!start.current) return;
      start.current = null;
      cb.onEnd();
    },
    // A drag shouldn't also register as a section-select click.
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
}
