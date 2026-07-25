import * as React from 'react';
import { useT } from '../../../lib/i18n/I18nProvider';
import { DisplayConfig, nearestQrSize } from '../../../pages/api/types';
import { SectionId } from './EditChrome';
import {
  BannerCard,
  RailShell,
  ThemeCard,
  ToggleCard,
  useRailCardRefs,
} from '../../edit/Rail';

interface EditRailProps {
  config: DisplayConfig;
  /** Which viewport edge the floating rail docks to. */
  side: 'left' | 'right';
  /** boardsOnDisplay is room state outside DisplayConfig, so it rides along
   * as its own prop pair instead of through onChange patches. */
  boardsOn: boolean;
  onToggleBoards: () => void;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
}

/** Show/hide toggles plus the non-spatial settings (theme, banner).
 * Everything spatial — order, sizes, width, side — is dragged on the page
 * itself; this panel floats over the edge opposite the sidebar. */
export function EditRail({
  config,
  boardsOn,
  onToggleBoards,
  selected,
  onSelect,
  onChange,
  side,
}: EditRailProps) {
  const { t } = useT();
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  // Tapping a section on the page reveals its card; the banner ghost goes
  // straight into typing.
  const cardRef = useRailCardRefs<SectionId>(selected, (id) => {
    if (id === 'banner') bannerInputRef.current?.focus();
  });

  const toggles: { id: SectionId; title: string; desc?: string; on: boolean; flip: () => void }[] = [
    {
      id: 'qr',
      title: t('host.display.qr'),
      on: config.qrSize !== 'hidden',
      flip: () =>
        onChange({ qrSize: config.qrSize === 'hidden' ? nearestQrSize(config.qrPx) : 'hidden' }),
    },
    {
      id: 'upNext',
      title: t('host.display.upNext'),
      on: config.showUpNext,
      flip: () => onChange({ showUpNext: !config.showUpNext }),
    },
    {
      id: 'nowPlaying',
      title: t('host.display.nowPlaying'),
      on: config.showNowPlaying,
      flip: () => onChange({ showNowPlaying: !config.showNowPlaying }),
    },
    // boardsOn is room state outside DisplayConfig (see the props note), so its
    // flip rides its own callback — but to the host it's just another section.
    {
      id: 'boards',
      title: t('host.display.boards'),
      on: boardsOn,
      flip: onToggleBoards,
    },
  ];

  return (
    <RailShell side={side} hint={t('host.display.dragEverything')}>
      <ThemeCard<SectionId>
        theme={config.theme}
        onPick={(theme) => onChange({ theme })}
        selected={selected}
        onSelect={onSelect}
      />

      {toggles.map(({ id, title, desc, on, flip }) => (
        <ToggleCard
          key={id}
          id={id}
          title={title}
          desc={desc}
          on={on}
          onFlip={flip}
          selected={selected}
          onSelect={onSelect}
          cardRef={cardRef(id)}
        />
      ))}

      <BannerCard
        id="banner"
        value={config.bannerLine}
        onChange={(bannerLine) => onChange({ bannerLine })}
        selected={selected}
        onSelect={onSelect}
        cardRef={cardRef('banner')}
        inputRef={bannerInputRef}
      />
    </RailShell>
  );
}
