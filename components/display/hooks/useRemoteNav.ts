import * as React from 'react';
import { NavRect, isBackKey, navDirFromKey, pickNext } from '../../../lib/spatialNav';

const FOCUSABLE_SELECTOR = 'button, a[href], [tabindex]:not([tabindex="-1"])';
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent !== null) return true;
  if (window.getComputedStyle(el).position !== 'fixed') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function toRect(el: HTMLElement): NavRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function useRemoteNav(
  rootRef: React.RefObject<HTMLElement>,
  opts: { enabled: boolean; initialFocus?: () => HTMLElement | null; onBack?: () => void }
): void {
  const { enabled } = opts;
  const initialFocusRef = React.useRef(opts.initialFocus);
  initialFocusRef.current = opts.initialFocus;
  const onBackRef = React.useRef(opts.onBack);
  onBackRef.current = opts.onBack;

  React.useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isBackKey(e)) {
        if (onBackRef.current) {
          onBackRef.current();
          e.preventDefault();
        }
        return;
      }

      const dir = navDirFromKey(e);
      if (!dir) return;
      const target = e.target as HTMLElement | null;
      if (target && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable)) return;

      const root = rootRef.current;
      if (!root) return;
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && isVisible(el)
      );
      if (candidates.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const activeIndex = active ? candidates.indexOf(active) : -1;

      if (activeIndex === -1) {
        const next = initialFocusRef.current?.() ?? candidates[0];
        next?.focus({ preventScroll: false });
        e.preventDefault();
        return;
      }

      const from = toRect(candidates[activeIndex]);
      const others = candidates
        .map((el, i) => ({ id: String(i), rect: toRect(el) }))
        .filter((c) => c.id !== String(activeIndex));
      const nextId = pickNext(from, others, dir);
      if (nextId !== null) candidates[Number(nextId)]?.focus({ preventScroll: false });
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, rootRef]);
}
