import { DisplayConfig, nearestQrSize } from '../../../pages/api/types';
import { RailToggle } from '../../edit/ConfigRail';
import { DisplaySectionId } from './useDisplayEdit';

/** Deliberately the same list, in the same order, as hostRailToggles. */
export function displayRailToggles(
  config: DisplayConfig,
  onChange: (patch: Partial<DisplayConfig>) => void,
  /** boardsOnDisplay is room state outside DisplayConfig, so it rides separately. */
  boardsOn: boolean,
  onToggleBoards: () => void
): RailToggle<DisplaySectionId>[] {
  return [
    {
      id: 'qr',
      labelKey: 'customize.qr',
      descKey: 'customize.qrDesc',
      on: config.qrSize !== 'hidden',
      flip: () =>
        onChange({ qrSize: config.qrSize === 'hidden' ? nearestQrSize(config.qrPx) : 'hidden' }),
    },
    {
      id: 'upNext',
      labelKey: 'customize.queue',
      on: config.showUpNext,
      flip: () => onChange({ showUpNext: !config.showUpNext }),
    },
    {
      id: 'nowPlaying',
      labelKey: 'customize.nowPlaying',
      on: config.showNowPlaying,
      flip: () => onChange({ showNowPlaying: !config.showNowPlaying }),
    },
    {
      id: 'boards',
      labelKey: 'customize.boards',
      descKey: 'customize.boardsDesc',
      on: boardsOn,
      flip: onToggleBoards,
    },
  ];
}
