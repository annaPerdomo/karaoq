import * as React from 'react';
import { useT } from '../../../lib/i18n/I18nProvider';
import { HostConfig } from '../../../pages/api/types';
import { BannerCard, RailShell, ThemeCard, ToggleCard, useRailCardRefs } from '../../edit/Rail';
import { HostSectionId } from './useHostEdit';

interface HostEditRailProps {
  config: HostConfig;
  side: 'left' | 'right';
  selected: HostSectionId | null;
  onSelect: (section: HostSectionId | null) => void;
  onChange: (patch: Partial<HostConfig>) => void;
}

export function HostEditRail({
  config,
  side,
  selected,
  onSelect,
  onChange,
}: HostEditRailProps) {
  const { t } = useT();
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  const cardRef = useRailCardRefs<HostSectionId>(selected, (id) => {
    if (id === 'banner') bannerInputRef.current?.focus();
  });

  const toggles: { id: HostSectionId; title: string; desc: string; on: boolean; flip: () => void }[] = [
    {
      id: 'boards',
      title: t('host.customize.boards'),
      desc: t('host.customize.boardsDesc'),
      on: config.showBoards,
      flip: () => onChange({ showBoards: !config.showBoards }),
    },
    {
      id: 'qr',
      title: t('host.customize.qr'),
      desc: t('host.customize.qrDesc'),
      on: config.showQr,
      flip: () => onChange({ showQr: !config.showQr }),
    },
  ];

  return (
    <RailShell side={side} hint={t('host.customize.railHint')}>
      <ThemeCard<HostSectionId>
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
