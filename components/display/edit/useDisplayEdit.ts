import * as React from 'react';
import setDisplayConfig from '../../../app/queue/setDisplayConfig';
import setBoardsOnDisplay from '../../../app/queue/setBoardsOnDisplay';
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig } from '../../../pages/api/types';
import { useConfigEdit } from '../../edit/useConfigEdit';
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

  const edit = useConfigEdit<DisplayConfig, SectionId>({
    joinCode,
    config,
    keys: CONFIG_KEYS,
    extraDirty: boardsDraft !== boardsOn,
    onReset: () => setBoardsDraft(boardsOn),
    save: async (code, draft) => {
      const configOk = await setDisplayConfig(code, draft);
      // Only write boards when it actually changed — one fewer round trip.
      const boardsOk =
        boardsDraft === boardsOn || (await setBoardsOnDisplay(code, boardsDraft));
      return configOk && boardsOk;
    },
    onSaved: (draft) => onSaved(draft, boardsDraft),
  });

  // A poll can refresh boardsOn mid-edit; follow it while the draft is
  // untouched, mirroring how the config draft follows the server.
  const lastBoards = React.useRef(boardsOn);
  React.useEffect(() => {
    setBoardsDraft((prev) => (prev === lastBoards.current ? boardsOn : prev));
    lastBoards.current = boardsOn;
  }, [boardsOn]);

  return {
    ...edit,
    boardsView: edit.editing ? boardsDraft : boardsOn,
    toggleBoards: () => setBoardsDraft((v) => !v),
  };
}

export type DisplayEditState = ReturnType<typeof useDisplayEdit>;
