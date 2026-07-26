import * as React from 'react';
import { SidebarPosition } from '../../pages/api/types';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '../../lib/limits';
import { configsEqual } from './configEquality';
import { useScalarDrag } from './hooks/useScalarDrag';

interface SurfaceLayout {
  sidebarPosition: SidebarPosition;
  sidebarWidth: number;
  nowPlayingHeight: number;
}

/** How long a fresh save outranks the server: the slowest poll (host's 3s) plus
 * the write's own round trip. */
export const SAVE_SETTLE_MS = 5000;

export function useConfigEdit<C extends SurfaceLayout, Id extends string>(opts: {
  joinCode: string | undefined;
  config: C;
  keys: (keyof C)[];
  nowPlayingBounds: { min: number; max: number };
  save: (joinCode: string, draft: C) => Promise<boolean>;
  onSaved: (draft: C) => void;
  extraDirty?: boolean;
  onReset?: () => void;
}) {
  const {
    joinCode,
    config,
    keys,
    nowPlayingBounds,
    save: persist,
    onSaved,
    extraDirty = false,
    onReset,
  } = opts;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<C>(config);
  const [selected, setSelected] = React.useState<Id | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  // What we last wrote, held until the server echoes it back. See `settled`.
  const [justSaved, setJustSaved] = React.useState<C | null>(null);
  const [sideDragTarget, setSideDragTarget] = React.useState<SidebarPosition | null>(null);

  const same = React.useCallback(
    (a: C, b: C) => configsEqual(a, b, keys),
    // `keys` is a module-level constant on both callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // A poll in flight at save time resolves with the PRE-save config; trust what
  // we just wrote until the server echoes it, or the page reverts after Save.
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

  // Follow polled config changes while the draft is untouched.
  const lastConfig = React.useRef(settled);
  React.useEffect(() => {
    // Snapshot prev BEFORE updating the ref: the updater can run during a later
    // render, when the ref already holds the new config and every draft looks pristine.
    const prev = lastConfig.current;
    lastConfig.current = settled;
    setDraft((d) => (same(d, prev) ? settled : d));
  }, [settled, same]);

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

  const widthDragProps = useScalarDrag({
    value: draft.sidebarWidth,
    min: SIDEBAR_WIDTH_MIN,
    max: SIDEBAR_WIDTH_MAX,
    axis: 'x',
    invert: draft.sidebarPosition === 'right',
    onChange: (sidebarWidth) => change({ sidebarWidth } as Partial<C>),
  });

  const heightDragProps = useScalarDrag({
    value: draft.nowPlayingHeight,
    min: nowPlayingBounds.min,
    max: nowPlayingBounds.max,
    axis: 'y',
    invert: true,
    onChange: (nowPlayingHeight) => change({ nowPlayingHeight } as Partial<C>),
  });

  return {
    editing,
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
    heightDragProps,
    enter,
    discard,
    change,
    save,
  };
}
