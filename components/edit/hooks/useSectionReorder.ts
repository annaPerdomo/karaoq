import * as React from 'react';

/** Hidden sections keep their slots (appending would teleport ghosts, and Save persists
 * it). Always returns a permutation of `order` — the endpoint's exactly-once check requires it. */
export function reorderSections<S extends string>(
  order: S[],
  visible: Record<S, boolean>,
  id: S,
  above: S[]
): S[] {
  const others = order.filter((s) => s !== id && visible[s]);
  // Normalise `above` so the result is a permutation whatever the caller passes.
  const cleared = others.filter((s) => above.includes(s));
  const run = [...cleared, id, ...others.filter((s) => !cleared.includes(s))];
  let i = 0;
  return order.map((s) => (visible[s] || s === id ? run[i++] : s));
}

/** Listens on window instead of pointer capture: reordering re-parents the grip
 * mid-drag, and a moved node silently loses its capture — the release never arrives. */
export function useSectionReorder<S extends string>(opts: {
  order: S[];
  visible: Record<S, boolean>;
  onReorder: (next: S[]) => void;
}) {
  const { order, visible, onReorder } = opts;
  const [lifted, setLifted] = React.useState<S | null>(null);
  const els = React.useRef<Partial<Record<S, HTMLDivElement | null>>>({});

  // The window move handler is installed once at lift, so it reads these
  // through refs, never its stale closure.
  const orderRef = React.useRef(order);
  orderRef.current = order;
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;
  const onReorderRef = React.useRef(onReorder);
  onReorderRef.current = onReorder;

  const teardownRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => teardownRef.current?.(), []);

  return {
    lifted,
    gripProps: (id: S): React.ComponentProps<'button'> => ({
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        // A second pointer landing mid-drag would double-install listeners.
        teardownRef.current?.();
        setLifted(id);
        const pointerId = e.pointerId;

        const onMove = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          const now = orderRef.current;
          const shown = visibleRef.current;
          const above = now.filter((s) => {
            if (s === id || !shown[s]) return false;
            const rect = els.current[s]?.getBoundingClientRect();
            return !!rect && ev.clientY > rect.top + rect.height / 2;
          });
          const next = reorderSections(now, shown, id, above);
          if (next.join() !== now.join()) onReorderRef.current(next);
        };
        const onEnd = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          teardownRef.current?.();
        };

        teardownRef.current = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onEnd);
          window.removeEventListener('pointercancel', onEnd);
          teardownRef.current = null;
          setLifted(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
      },
      // A drag shouldn't also register as a section-select click.
      onClick: (e) => e.stopPropagation(),
    }),
    sectionRef: (id: S) => (el: HTMLDivElement | null) => {
      els.current[id] = el;
    },
  };
}
