import * as React from 'react';
import { SAVE_SETTLE_MS } from '../edit/useConfigEdit';

/** Draft for a room field outside a surface config (boardsOnDisplay, the brand),
 * staged alongside it in Customize. Wire `dirty` to useConfigEdit's extraDirty,
 * `reset` to onReset, and call `markSaved` from onSaved. */
export function useRoomFieldDraft<T>(live: T, equals: (a: T, b: T) => boolean) {
  // Polls deliver a fresh object each time; keep the old one while equal so the
  // effects below fire only on a real change.
  const stableRef = React.useRef(live);
  if (!equals(stableRef.current, live)) stableRef.current = live;
  const stable = stableRef.current;

  const [draft, setDraft] = React.useState(live);
  // Mirrors useConfigEdit's justSaved so a poll predating our write can't revert the field.
  const saved = React.useRef(live);
  const [settling, setSettling] = React.useState(false);

  React.useEffect(() => {
    if (!settling) return;
    if (equals(stable, saved.current)) {
      setSettling(false);
      return;
    }
    const id = setTimeout(() => setSettling(false), SAVE_SETTLE_MS);
    return () => clearTimeout(id);
    // `equals` is a module-level function on every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, settling]);

  const settled = settling ? saved.current : stable;

  // Follow the polled value while the draft is untouched.
  const last = React.useRef(stable);
  React.useEffect(() => {
    // Snapshot prev before updating the ref: the updater can run during a later
    // render, when the ref already holds the new value and a pristine check would
    // wrongly pass and drop a staged edit.
    const prev = last.current;
    last.current = stable;
    setDraft((d) => (equals(d, prev) ? stable : d));
    // `equals` is a module-level function on every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable]);

  return {
    draft,
    setDraft,
    dirty: !equals(draft, settled),
    reset: () => setDraft(settled),
    markSaved: (value: T) => {
      saved.current = value;
      setSettling(true);
    },
    settled,
  };
}
