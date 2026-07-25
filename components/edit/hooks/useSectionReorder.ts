import * as React from 'react';

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
 * pointer moves. Hidden sections keep their relative places at the tail.
 *
 * The drag listens on window rather than capturing the pointer on the grip:
 * reordering re-parents the grip's DOM node mid-drag, and a moved node silently
 * loses its pointer capture — the release then never arrives, and the "stuck"
 * drag kept replaying on every later hover over any grip. */
export function useSectionReorder<S extends string>(opts: {
  order: S[];
  visible: Record<S, boolean>;
  onReorder: (next: S[]) => void;
}) {
  const { order, visible, onReorder } = opts;
  const [lifted, setLifted] = React.useState<S | null>(null);
  const els = React.useRef<Partial<Record<S, HTMLDivElement | null>>>({});

  // The window move handler is installed once at lift and lives across
  // renders, while each reorder it triggers immediately changes these values —
  // so it reads them through refs, never its stale closure.
  const orderRef = React.useRef(order);
  orderRef.current = order;
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;
  const onReorderRef = React.useRef(onReorder);
  onReorderRef.current = onReorder;

  // Removes the window listeners of the drag in flight, if any.
  const teardownRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => teardownRef.current?.(), []);

  return {
    /** The section being dragged right now (render it raised). */
    lifted,
    /** Spread onto a section's grip button. */
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
    /** Ref callback for a section's wrapper — the midpoints are measured off these. */
    sectionRef: (id: S) => (el: HTMLDivElement | null) => {
      els.current[id] = el;
    },
  };
}
