import * as React from 'react';
import setDisplayConfig from '../../../app/queue/setDisplayConfig';
import { saveBrandOk } from '../../../app/queue/brand';
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig, RoomBrand } from '../../../pages/api/types';
import { DISPLAY_NOW_H_MIN, DISPLAY_NOW_H_MAX } from '../../../lib/limits';
import { brandsEqual } from '../../../lib/brandStyle';
import { useConfigEdit } from '../../edit/useConfigEdit';
import { useRoomFieldDraft } from '../../hooks/useRoomFieldDraft';

export type DisplaySectionId =
  | 'qr'
  | 'upNext'
  | 'nowPlaying'
  | 'banner'
  | 'boards';

const CONFIG_KEYS = Object.keys(DEFAULT_DISPLAY_CONFIG) as (keyof DisplayConfig)[];

const sameBool = (a: boolean, b: boolean) => a === b;

// boardsOnDisplay and the brand are room state outside DisplayConfig, so each
// needs its own draft and its own write on save.
export function useDisplayEdit(opts: {
  joinCode: string | undefined;
  config: DisplayConfig;
  boardsOn: boolean;
  brand: RoomBrand;
  onSaved: (config: DisplayConfig, boardsOn: boolean, brand: RoomBrand) => void;
  scale?: number;
  sidebarScale?: number;
}) {
  const { joinCode, config, boardsOn, onSaved, scale, sidebarScale } = opts;
  const boards = useRoomFieldDraft(boardsOn, sameBool);
  const brand = useRoomFieldDraft(opts.brand, brandsEqual);
  const [uploading, setUploading] = React.useState(false);
  // The config write that landed in a save whose brand write then failed: a retry skips it.
  const configWritten = React.useRef<{ draft: DisplayConfig; boards?: boolean } | null>(null);

  const edit = useConfigEdit<DisplayConfig, DisplaySectionId>({
    joinCode,
    config,
    keys: CONFIG_KEYS,
    nowPlayingBounds: { min: DISPLAY_NOW_H_MIN, max: DISPLAY_NOW_H_MAX },
    scale,
    sidebarScale,
    extraDirty: boards.dirty || brand.dirty,
    onReset: () => {
      configWritten.current = null;
      boards.reset();
      brand.reset();
    },
    save: async (code, draft) => {
      // Send boards only when changed: keeps untouched rooms out of the boardsOnDisplay stat.
      const boardsArg = boards.dirty ? boards.draft : undefined;
      const done = configWritten.current;
      if (!done || done.draft !== draft || done.boards !== boardsArg) {
        if (!(await setDisplayConfig(code, draft, boardsArg))) return false;
        configWritten.current = { draft, boards: boardsArg };
      }
      return !brand.dirty || saveBrandOk(code, brand.draft, 'display');
    },
    onSaved: (draft) => {
      configWritten.current = null;
      boards.markSaved(boards.draft);
      brand.markSaved(brand.draft);
      onSaved(draft, boards.draft, brand.draft);
    },
  });

  return {
    ...edit,
    // A logo upload in flight blocks Save and Discard.
    dirty: edit.dirty || uploading,
    saving: edit.saving || uploading,
    save: () => (uploading ? Promise.resolve() : edit.save()),
    boardsView: edit.editing ? boards.draft : boards.settled,
    toggleBoards: () => boards.setDraft((v) => !v),
    brandView: edit.editing ? brand.draft : brand.settled,
    brandControls: {
      brand: edit.editing ? brand.draft : brand.settled,
      onChange: brand.setDraft,
      onBusyChange: setUploading,
    },
  };
}

export type DisplayEditState = ReturnType<typeof useDisplayEdit>;
