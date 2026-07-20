import * as React from 'react';
import { SidebarPosition } from '../../pages/api/types';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '../../lib/limits';
import { configsEqual } from './configEquality';
import { useScalarDrag } from './hooks/useScalarDrag';

/** The layout fields every customizable surface shares, so this hook can own
 * the sidebar's side-flip and resize drags for both. */
interface SidebarLayout {
  sidebarPosition: SidebarPosition;
  sidebarWidth: number;
}

/**
 * Edit-mode state for a live, customizable page — the engine behind both the
 * display's and the host's Customize modes.
 *
 * Edits stage in a local draft that the real page renders from; nothing reaches
 * the room until save(). The page stays fully live throughout (video keeps
 * playing, polls keep running) — this only swaps which config feeds the render.
 *
 * Surfaces with state outside their config (the display's boardsOnDisplay) feed
 * it in through `extraDirty` / `onReset` and fold it into their own `save`.
 */
export function useConfigEdit<C extends SidebarLayout, Id extends string>(opts: {
  joinCode: string | undefined;
  /** Server-synced config (poll/broadcast). */
  config: C;
  /** Which fields count as the config, for draft-vs-server comparison. */
  keys: (keyof C)[];
  /** Persist the draft. Resolve false to surface the save-failed state. */
  save: (joinCode: string, draft: C) => Promise<boolean>;
  /** Adopt saved values immediately instead of waiting for the next poll. */
  onSaved: (draft: C) => void;
  /** Unsaved state living outside the config. */
  extraDirty?: boolean;
  /** Reset that outside state when entering or discarding. */
  onReset?: () => void;
}) {
  const { joinCode, config, keys, save: persist, onSaved, extraDirty = false, onReset } = opts;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<C>(config);
  const [selected, setSelected] = React.useState<Id | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  // In-flight sidebar side-flip: where the sidebar would land if the drag
  // ended now (drop zones render while non-null).
  const [sideDragTarget, setSideDragTarget] = React.useState<SidebarPosition | null>(null);

  const same = React.useCallback(
    (a: C, b: C) => configsEqual(a, b, keys),
    // `keys` is a module-level constant on both callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const dirty = editing && (!same(draft, config) || extraDirty);

  // A poll can refresh the room config mid-edit (e.g. a co-host change).
  // Follow it while the draft is untouched; otherwise the in-progress edits
  // win and save() overwrites.
  const lastConfig = React.useRef(config);
  React.useEffect(() => {
    setDraft((prev) => (same(prev, lastConfig.current) ? config : prev));
    lastConfig.current = config;
  }, [config, same]);

  // Closing the tab would silently drop staged edits.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function reset() {
    setDraft(config);
    setSelected(null);
    setSaveFailed(false);
    onReset?.();
  }

  function enter() {
    reset();
    setEditing(true);
  }

  function discard() {
    reset();
    setEditing(false);
  }

  function change(patch: Partial<C>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    if (!joinCode) return;
    setSaving(true);
    setSaveFailed(false);
    const ok = await persist(joinCode, draft);
    setSaving(false);
    if (ok) {
      onSaved(draft);
      setSelected(null);
      setEditing(false);
    } else {
      setSaveFailed(true);
    }
  }

  // Drag props for the sidebar's "switch sides" handle: track which viewport
  // half the pointer is over, commit on release.
  const sideDragProps: React.ComponentProps<'button'> = {
    onPointerDown: (e) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setSideDragTarget(draft.sidebarPosition);
    },
    onPointerMove: (e) => {
      if (sideDragTarget === null) return;
      setSideDragTarget(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
    },
    onPointerUp: () => {
      if (sideDragTarget && sideDragTarget !== draft.sidebarPosition) {
        change({ sidebarPosition: sideDragTarget } as Partial<C>);
      }
      setSideDragTarget(null);
    },
    onPointerCancel: () => setSideDragTarget(null),
  };

  // Drag the sidebar's inner edge to resize it; docked right, dragging the
  // edge outward (leftwards) widens it.
  const widthDragProps = useScalarDrag({
    value: draft.sidebarWidth,
    min: SIDEBAR_WIDTH_MIN,
    max: SIDEBAR_WIDTH_MAX,
    axis: 'x',
    invert: draft.sidebarPosition === 'right',
    onChange: (sidebarWidth) => change({ sidebarWidth } as Partial<C>),
  });

  return {
    editing,
    /** What the page should render from: the draft while editing. */
    view: editing ? draft : config,
    draft,
    dirty,
    saving,
    saveFailed,
    selected,
    setSelected,
    sideDragTarget,
    sideDragProps,
    widthDragProps,
    enter,
    discard,
    change,
    save,
  };
}
