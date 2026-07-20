import * as React from 'react';

interface HandleDragCallbacks {
  onStart?: () => void;
  /** Deltas are viewport pixels — the handles sit on the real, unscaled page.
   * The raw event is included for interactions that need absolute pointer
   * coordinates (e.g. reordering). */
  onMove: (dx: number, dy: number, e: React.PointerEvent) => void;
  onEnd: () => void;
}

/** Pointer-capture drag for the edit-mode handles on a live page.
 * Spread the returned props onto the handle element. */
export function useHandleDrag(cb: HandleDragCallbacks) {
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
      cb.onMove(e.clientX - start.current.x, e.clientY - start.current.y, e);
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
