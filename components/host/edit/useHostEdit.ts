import setHostConfig from '../../../app/queue/setHostConfig';
import { DEFAULT_HOST_CONFIG, HostConfig } from '../../../pages/api/types';
import { HOST_NOW_H_MIN, HOST_NOW_H_MAX } from '../../../lib/limits';
import { useConfigEdit } from '../../edit/useConfigEdit';

export type HostSectionId =
  | 'queue'
  | 'boards'
  | 'qr'
  | 'banner'
  | 'transport';

const CONFIG_KEYS = Object.keys(DEFAULT_HOST_CONFIG) as (keyof HostConfig)[];

export function useHostEdit(opts: {
  joinCode: string | undefined;
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
