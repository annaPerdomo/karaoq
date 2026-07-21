import * as React from 'react';
import { useHandleDrag } from './useHandleDrag';

/** Drop `id` into the visible run after `above` (the visible sections the
 * pointer has already cleared), leaving hidden sections in the slots they
 * already hold. Appending hidden ones instead would make a ghost — an unset
 * welcome line, say — teleport to the bottom on any drag, and that rewritten
 * order is what Save persists. Always a permutation of `order`, which the
 * endpoint's exactly-once check requires. */
export function reorderSections<S extends string>(
  order: S[],
  visible: Record<S, boolean>,
  id: S,
  above: S[]
): S[] {
  const others = order.filter((s) => s !== id && visible[s]);
  // Normalise `above` to real, visible, non-lifted sections so the result is a
  // permutation whatever the caller passes.
  const cleared = others.filter((s) => above.includes(s));
  const run = [...cleared, id, ...others.filter((s) => !cleared.includes(s))];
  let i = 0;
  return order.map((s) => (visible[s] || s === id ? run[i++] : s));
}

/** Drag-to-reorder for a vertical stack of named sections — the display
 * sidebar's QR/welcome/up-next/boards and the host sidebar's queue/boards/QR.
 *
 * The lifted section lands in the slot given by how many other visible
 * sections' midpoints the pointer has passed, so the order updates live as the
 * pointer moves. Hidden sections keep their relative places at the tail. */
export function useSectionReorder<S extends string>(opts: {
  order: S[];
  visible: Record<S, boolean>;
  onReorder: (next: S[]) => void;
}) {
  const { order, visible, onReorder } = opts;
  const [lifted, setLifted] = React.useState<S | null>(null);
  const liftedRef = React.useRef<S | null>(null);
  const els = React.useRef<Partial<Record<S, HTMLDivElement | null>>>({});

  const drag = useHandleDrag({
    onMove: (_dx, _dy, e) => {
      const id = liftedRef.current;
      if (!id) return;
      const above = order.filter((s) => {
        if (s === id || !visible[s]) return false;
        const rect = els.current[s]?.getBoundingClientRect();
        return !!rect && e.clientY > rect.top + rect.height / 2;
      });
      const next = reorderSections(order, visible, id, above);
      if (next.join() !== order.join()) onReorder(next);
    },
    onEnd: () => {
      liftedRef.current = null;
      setLifted(null);
    },
  });

  return {
    /** The section being dragged right now (render it raised). */
    lifted,
    /** Spread onto a section's grip button. */
    gripProps: (id: S): React.ComponentProps<'button'> => ({
      ...drag,
      onPointerDown: (e) => {
        liftedRef.current = id;
        setLifted(id);
        drag.onPointerDown(e);
      },
    }),
    /** Ref callback for a section's wrapper — the midpoints are measured off these. */
    sectionRef: (id: S) => (el: HTMLDivElement | null) => {
      els.current[id] = el;
    },
  };
}
