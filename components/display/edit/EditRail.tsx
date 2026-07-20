import * as React from 'react';
import styles from '../../../styles/Host.module.css';
import { useT } from '../../../lib/i18n/I18nProvider';
import { MAX_WELCOME_LENGTH } from '../../../lib/limits';
import { DisplayConfig, nearestQrSize } from '../../../pages/api/types';
import { SectionId } from './EditChrome';
import {
  RailShell,
  RailCard,
  ThemeCard,
  ToggleCard,
  ToggleRow,
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

/** Show/hide toggles plus the non-spatial settings (theme, welcome, attract).
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
  const [welcomeDraft, setWelcomeDraft] = React.useState(config.welcomeLine);
  const welcomeInputRef = React.useRef<HTMLInputElement>(null);

  // A stale draft would clobber a config refreshed from the server (poll/resync).
  React.useEffect(() => setWelcomeDraft(config.welcomeLine), [config.welcomeLine]);

  // Tapping a section on the page reveals its card; the welcome ghost goes
  // straight into typing.
  const cardRef = useRailCardRefs<SectionId>(selected, (id) => {
    if (id === 'welcome') welcomeInputRef.current?.focus();
  });

  function commitWelcome() {
    const trimmed = welcomeDraft.trim();
    setWelcomeDraft(trimmed);
    if (trimmed !== config.welcomeLine) onChange({ welcomeLine: trimmed });
  }

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

      <RailCard id="welcome" selected={selected} onSelect={onSelect} cardRef={cardRef('welcome')}>
        <div className={styles.spLabel}>{t('host.display.welcome')}</div>
        <input
          ref={welcomeInputRef}
          className={styles.dpWelcomeInput}
          type="text"
          value={welcomeDraft}
          maxLength={MAX_WELCOME_LENGTH}
          placeholder={t('host.display.welcomePh')}
          onChange={(e) => setWelcomeDraft(e.target.value)}
          onBlur={commitWelcome}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitWelcome();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </RailCard>

      <ToggleCard
        id="attract"
        title={t('host.display.attract')}
        desc={t('host.display.attractDesc')}
        on={config.attractMode}
        onFlip={() => onChange({ attractMode: !config.attractMode })}
        selected={selected}
        onSelect={onSelect}
        cardRef={cardRef('attract')}
      />

      {/* Boards rotate on the TV between songs; they have no preview spot, so
          the toggle lives here with the other TV-content switches. */}
      <RailCard selected={selected} onSelect={onSelect}>
        <ToggleRow
          title={t('host.settings.boards')}
          desc={boardsOn ? t('host.settings.boardsOn') : t('host.settings.boardsOff')}
          on={boardsOn}
          onFlip={onToggleBoards}
        />
      </RailCard>
    </RailShell>
  );
}
