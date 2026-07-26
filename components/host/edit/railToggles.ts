import { HostConfig } from '../../../pages/api/types';
import { RailToggle } from '../../edit/ConfigRail';
import { HostSectionId } from './useHostEdit';

/** Deliberately the same list, in the same order, as displayRailToggles — the
 * two surfaces show the same five regions and only the bar's contents differ
 * (the host's carries playback controls). Keep them in step. */
export function hostRailToggles(
  config: HostConfig,
  onChange: (patch: Partial<HostConfig>) => void
): RailToggle<HostSectionId>[] {
  return [
    {
      id: 'qr',
      labelKey: 'customize.qr',
      descKey: 'customize.qrDesc',
      on: config.showQr,
      flip: () => onChange({ showQr: !config.showQr }),
    },
    {
      id: 'queue',
      labelKey: 'customize.queue',
      on: config.showQueue,
      flip: () => onChange({ showQueue: !config.showQueue }),
    },
    {
      id: 'transport',
      labelKey: 'customize.nowPlaying',
      on: config.showTransport,
      flip: () => onChange({ showTransport: !config.showTransport }),
    },
    {
      id: 'boards',
      labelKey: 'customize.boards',
      descKey: 'customize.boardsDesc',
      on: config.showBoards,
      flip: () => onChange({ showBoards: !config.showBoards }),
    },
  ];
}
