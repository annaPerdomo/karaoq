import setHostConfig from '../../../app/queue/setHostConfig';
import { DEFAULT_HOST_CONFIG, HostConfig } from '../../../pages/api/types';
import { HOST_NOW_H_MIN, HOST_NOW_H_MAX } from '../../../lib/limits';
import { useConfigEdit } from '../../edit/useConfigEdit';

/** Sections of the host page that Customize mode can select and edit in place —
 * the real control-surface elements, not copies. */
export type HostSectionId =
  | 'queue'
  | 'boards'
  | 'qr'
  | 'banner'
  | 'transport';

const CONFIG_KEYS = Object.keys(DEFAULT_HOST_CONFIG) as (keyof HostConfig)[];

/** Edit-mode state for the live host page. All the machinery is shared with the
 * display's Customize mode — this only binds it to HostConfig and its endpoint. */
export function useHostEdit(opts: {
  joinCode: string | undefined;
  /** Server-synced value (poll). */
  config: HostConfig;
  /** Adopt saved values immediately instead of waiting for the next poll. */
  onSaved: (config: HostConfig) => void;
}) {
  return useConfigEdit<HostConfig, HostSectionId>({
    joinCode: opts.joinCode,
    config: opts.config,
    keys: CONFIG_KEYS,
    nowPlayingBounds: { min: HOST_NOW_H_MIN, max: HOST_NOW_H_MAX },
    save: setHostConfig,
    onSaved: opts.onSaved,
  });
}

export type HostEditState = ReturnType<typeof useHostEdit>;
