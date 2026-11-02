import * as React from 'react';
import setHostConfig from '../../../app/queue/setHostConfig';
import { saveBrandOk } from '../../../app/queue/brand';
import { DEFAULT_HOST_CONFIG, HostConfig, RoomBrand } from '../../../pages/api/types';
import { HOST_NOW_H_MIN, HOST_NOW_H_MAX } from '../../../lib/limits';
import { brandsEqual } from '../../../lib/brandStyle';
import { useConfigEdit } from '../../edit/useConfigEdit';
import { useRoomFieldDraft } from '../../hooks/useRoomFieldDraft';

export type HostSectionId =
  | 'queue'
  | 'boards'
  | 'qr'
  | 'banner'
  | 'transport';

const CONFIG_KEYS = Object.keys(DEFAULT_HOST_CONFIG) as (keyof HostConfig)[];

// The brand is room state shared with the Display, outside HostConfig: its own
// draft, written only when it changed.
export function useHostEdit(opts: {
  joinCode: string | undefined;
  config: HostConfig;
  brand: RoomBrand;
  /** Adopt saved values immediately instead of waiting for the next poll. */
  onSaved: (config: HostConfig, brand: RoomBrand) => void;
}) {
  const brand = useRoomFieldDraft(opts.brand, brandsEqual);
  const [uploading, setUploading] = React.useState(false);
  // The config write that landed in a save whose brand write then failed: a retry skips it.
  const configWritten = React.useRef<HostConfig | null>(null);

  const edit = useConfigEdit<HostConfig, HostSectionId>({
    joinCode: opts.joinCode,
    config: opts.config,
    keys: CONFIG_KEYS,
    nowPlayingBounds: { min: HOST_NOW_H_MIN, max: HOST_NOW_H_MAX },
    extraDirty: brand.dirty,
    onReset: () => {
      configWritten.current = null;
      brand.reset();
    },
    save: async (code, draft) => {
      if (configWritten.current !== draft) {
        if (!(await setHostConfig(code, draft))) return false;
        configWritten.current = draft;
      }
      return !brand.dirty || saveBrandOk(code, brand.draft, 'host');
    },
    onSaved: (draft) => {
      configWritten.current = null;
      brand.markSaved(brand.draft);
      opts.onSaved(draft, brand.draft);
    },
  });

  return {
    ...edit,
    // A logo upload in flight blocks Save and Discard.
    dirty: edit.dirty || uploading,
    saving: edit.saving || uploading,
    save: () => (uploading ? Promise.resolve() : edit.save()),
    brandView: edit.editing ? brand.draft : brand.settled,
    brandControls: {
      brand: edit.editing ? brand.draft : brand.settled,
      onChange: brand.setDraft,
      onBusyChange: setUploading,
    },
  };
}

export type HostEditState = ReturnType<typeof useHostEdit>;
