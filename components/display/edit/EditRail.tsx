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
  side: 'left' | 'right';
  /** boardsOnDisplay is room state outside DisplayConfig, so it rides as its own prop pair. */
  boardsOn: boolean;
  onToggleBoards: () => void;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
}

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
