import * as React from 'react';
import styles from '../../styles/Admin.module.css';

export function nextHintState(open: boolean, action: 'toggle' | 'outside'): boolean {
  if (action === 'outside') return false;
  return !open;
}

const BUBBLE_WIDTH = 288;

function isTouchFirst(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: none)').matches);
}

export function TapHint({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [alignRight, setAlignRight] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const bubbleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        setOpen(nextHintState(open, 'outside'));
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open || !ref.current || typeof window === 'undefined') return;
    const rect = ref.current.getBoundingClientRect();
    setAlignRight(rect.left + BUBBLE_WIDTH > window.innerWidth);
  }, [open]);

  function toggle() {
    setOpen((prev) => nextHintState(prev, 'toggle'));
  }

  function handleClick(e: React.MouseEvent) {
    if (!isTouchFirst()) return;
    e.stopPropagation();
    toggle();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  if (!text) {
    return <>{children}</>;
  }

  return (
    <span
      ref={ref}
      className={styles.hint}
      title={text}
      tabIndex={0}
      aria-describedby={open ? bubbleId : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={className}>{children}</span>
      {open && (
        <span
          id={bubbleId}
          role="tooltip"
          className={`${styles.hintBubble} ${alignRight ? styles.hintBubbleRight : ''}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
