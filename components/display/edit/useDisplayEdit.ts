import * as React from 'react';
import setDisplayConfig from '../../../app/queue/setDisplayConfig';
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig } from '../../../pages/api/types';
import { DISPLAY_NOW_H_MIN, DISPLAY_NOW_H_MAX } from '../../../lib/limits';
import { SAVE_SETTLE_MS, useConfigEdit } from '../../edit/useConfigEdit';

export type DisplaySectionId =
  | 'qr'
  | 'upNext'
  | 'nowPlaying'
  | 'banner'
  | 'boards';

const CONFIG_KEYS = Object.keys(DEFAULT_DISPLAY_CONFIG) as (keyof DisplayConfig)[];

// boardsOnDisplay is room state outside DisplayConfig, so it needs its own
// draft and its own write on save.
export function useDisplayEdit(opts: {
  joinCode: string | undefined;
  config: DisplayConfig;
  boardsOn: boolean;
  onSaved: (config: DisplayConfig, boardsOn: boolean) => void;
}) {
  const { joinCode, config, boardsOn, onSaved } = opts;
  const [boardsDraft, setBoardsDraft] = React.useState(boardsOn);
  // Mirrors useConfigEdit's justSaved so a poll predating our write can't revert boards.
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

  const edit = useConfigEdit<DisplayConfig, DisplaySectionId>({
    joinCode,
    config,
    keys: CONFIG_KEYS,
    nowPlayingBounds: { min: DISPLAY_NOW_H_MIN, max: DISPLAY_NOW_H_MAX },
    extraDirty: boardsDraft !== settledBoards,
    onReset: () => setBoardsDraft(settledBoards),
    // Send boards only when changed: keeps untouched rooms out of the boardsOnDisplay stat.
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

  // Follow polled boardsOn while the draft is untouched.
  const lastBoards = React.useRef(boardsOn);
  React.useEffect(() => {
    // Snapshot prev before updating the ref: the updater can run during a later
    // render, when the ref already holds the new value and a pristine check would
    // wrongly pass and drop a staged edit.
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
