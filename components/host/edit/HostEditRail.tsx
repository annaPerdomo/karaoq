import { useT } from '../../../lib/i18n/I18nProvider';
import { HostConfig } from '../../../pages/api/types';
import { RailShell, ThemeCard, ToggleCard, useRailCardRefs } from '../../edit/Rail';
import { HostSectionId } from './useHostEdit';

interface HostEditRailProps {
  config: HostConfig;
  /** Which viewport edge the floating rail docks to. */
  side: 'left' | 'right';
  selected: HostSectionId | null;
  onSelect: (section: HostSectionId | null) => void;
  onChange: (patch: Partial<HostConfig>) => void;
}

/** Theme picker plus the show/hide toggles for the host control surface.
 * Everything spatial — the sidebar's side and width, section order, the QR's
 * size — is dragged on the page itself. */
export function HostEditRail({
  config,
  side,
  selected,
  onSelect,
  onChange,
}: HostEditRailProps) {
  const { t } = useT();
  const cardRef = useRailCardRefs<HostSectionId>(selected);

  const toggles: { id: HostSectionId; title: string; desc: string; on: boolean; flip: () => void }[] = [
    {
      id: 'history',
      title: t('host.customize.history'),
      desc: t('host.customize.historyDesc'),
      on: config.showHistory,
      flip: () => onChange({ showHistory: !config.showHistory }),
    },
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
    </RailShell>
  );
}
