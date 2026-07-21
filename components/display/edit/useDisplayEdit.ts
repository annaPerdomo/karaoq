import * as React from 'react';
import setDisplayConfig from '../../../app/queue/setDisplayConfig';
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig } from '../../../pages/api/types';
import { SAVE_SETTLE_MS, useConfigEdit } from '../../edit/useConfigEdit';
import { SectionId } from './EditChrome';

const CONFIG_KEYS = Object.keys(DEFAULT_DISPLAY_CONFIG) as (keyof DisplayConfig)[];

/** Edit-mode state for the live display page. The draft/dirty/save machinery is
 * shared with the host's Customize mode; layered on top is boardsOnDisplay,
 * which is room state outside DisplayConfig and so needs its own draft and its
 * own write on save. */
export function useDisplayEdit(opts: {
  joinCode: string | undefined;
  /** Server-synced values (poll/broadcast). */
  config: DisplayConfig;
  boardsOn: boolean;
  /** Adopt saved values immediately instead of waiting for the next poll. */
  onSaved: (config: DisplayConfig, boardsOn: boolean) => void;
}) {
  const { joinCode, config, boardsOn, onSaved } = opts;
  const [boardsDraft, setBoardsDraft] = React.useState(boardsOn);
  // Mirrors useConfigEdit's justSaved for the one field living outside the
  // config, so a poll predating our write can't revert it either.
  const savedBoards = React.useRef(boardsOn);
  const [settling, setSettling] = React.useState(false);

  React.useEffect(() => {
    if (!settling) return;
    if (boardsOn === savedBoards.current) {
      setSettling(false);
      return;
    }
    const id = setTimeout(() => setSettling(false), SAVE_SETTLE_MS);
    return () => clearTimeout(id);
  }, [boardsOn, settling]);

  const settledBoards = settling ? savedBoards.current : boardsOn;

  const edit = useConfigEdit<DisplayConfig, SectionId>({
    joinCode,
    config,
    keys: CONFIG_KEYS,
    extraDirty: boardsDraft !== settledBoards,
    onReset: () => setBoardsDraft(settledBoards),
    // One save = one write = one analytics event. Sending boards along only
    // when it changed keeps untouched rooms out of the boardsOnDisplay stat.
    save: (code, draft) =>
      setDisplayConfig(
        code,
        draft,
        boardsDraft === settledBoards ? undefined : boardsDraft
      ),
    onSaved: (draft) => {
      savedBoards.current = boardsDraft;
      setSettling(true);
      onSaved(draft, boardsDraft);
    },
  });

  // A poll can refresh boardsOn mid-edit; follow it while the draft is
  // untouched, mirroring how the config draft follows the server.
  const lastBoards = React.useRef(boardsOn);
  React.useEffect(() => {
    // Capture the previous value before updating the ref — the updater can run
    // during a later render, when the ref already holds the new value and a
    // pristine check would wrongly pass (and quietly drop a staged edit).
    const prev = lastBoards.current;
    lastBoards.current = boardsOn;
    setBoardsDraft((d) => (d === prev ? boardsOn : d));
  }, [boardsOn]);

  return {
    ...edit,
    boardsView: edit.editing ? boardsDraft : settledBoards,
    toggleBoards: () => setBoardsDraft((v) => !v),
  };
}

export type DisplayEditState = ReturnType<typeof useDisplayEdit>;
