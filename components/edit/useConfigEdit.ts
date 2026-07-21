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

/** How long a fresh save outranks the server, covering the slowest poll
 * (the host's 3s) plus the write's own round trip. */
export const SAVE_SETTLE_MS = 5000;

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
  // What we last wrote, held until the server echoes it back. See `settled`.
  const [justSaved, setJustSaved] = React.useState<C | null>(null);
  // In-flight sidebar side-flip: where the sidebar would land if the drag
  // ended now (drop zones render while non-null).
  const [sideDragTarget, setSideDragTarget] = React.useState<SidebarPosition | null>(null);

  const same = React.useCallback(
    (a: C, b: C) => configsEqual(a, b, keys),
    // `keys` is a module-level constant on both callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // A poll already in flight when we save resolves with the PRE-save config, so
  // for one poll interval the server would tell us to revert. Trust what we just
  // wrote until the server echoes it back — the same bargain Display makes for
  // play/pause via localPauseRef. Without this the page visibly reverts after
  // Save, and the draft re-syncs to the stale config, so re-entering Customize
  // and saving again silently undoes the edit.
  const settled = justSaved ?? config;

  React.useEffect(() => {
    if (!justSaved) return;
    if (same(config, justSaved)) {
      setJustSaved(null);
      return;
    }
    // Never shield forever: if the echo never comes, the server wins again.
    const id = setTimeout(() => setJustSaved(null), SAVE_SETTLE_MS);
    return () => clearTimeout(id);
  }, [config, justSaved, same]);

  const dirty = editing && (!same(draft, settled) || extraDirty);

  // A poll can refresh the room config mid-edit (e.g. a co-host change).
  // Follow it while the draft is untouched; otherwise the in-progress edits
  // win and save() overwrites.
  const lastConfig = React.useRef(settled);
  React.useEffect(() => {
    // Read the previous value into a local BEFORE updating the ref: the updater
    // below can run during a later render, by which point the ref already holds
    // the new config and every draft would look pristine.
    const prev = lastConfig.current;
    lastConfig.current = settled;
    setDraft((d) => (same(d, prev) ? settled : d));
  }, [settled, same]);

  // Closing the tab would silently drop staged edits.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function reset() {
    setDraft(settled);
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
      setJustSaved(draft);
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
      e.currentTarget.setPointerCapture(e.pointerId);
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
    /** What the page should render from: the draft while editing, and our own
     * just-saved values until the server catches up. */
    view: editing ? draft : settled,
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
