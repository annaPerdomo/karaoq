import * as React from 'react';
import p from '../../../styles/DisplayDesigner.module.css';
import styles from '../../../styles/Host.module.css';
import { useT } from '../../../lib/i18n/I18nProvider';
import { MAX_WELCOME_LENGTH } from '../../../lib/limits';
import { DisplayConfig, DisplayTheme, nearestQrSize } from '../../../pages/api/types';
import { SectionId } from './PreviewSpot';

const THEMES: { id: DisplayTheme; dot: string }[] = [
  { id: 'classic', dot: p.swatchClassic },
  { id: 'minimal', dot: p.swatchMinimal },
  { id: 'neon', dot: p.swatchNeon },
];

interface DesignerRailProps {
  config: DisplayConfig;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
}

function RailCard({
  id,
  selected,
  onSelect,
  cardRef,
  children,
}: {
  id?: SectionId;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={cardRef}
      className={`${p.railCard} ${id && selected === id ? p.railCardOn : ''}`}
      onClick={id ? () => onSelect(id) : undefined}
    >
      {children}
    </div>
  );
}

/** Show/hide toggles plus the non-spatial settings (theme, welcome, attract).
 * Everything spatial — order, sizes, width, side — is dragged on the preview. */
export function DesignerRail({ config, selected, onSelect, onChange }: DesignerRailProps) {
  const { t } = useT();
  const [welcomeDraft, setWelcomeDraft] = React.useState(config.welcomeLine);
  const welcomeInputRef = React.useRef<HTMLInputElement>(null);
  const cardRefs = React.useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  // A stale draft would clobber a config refreshed from the server (poll/resync).
  React.useEffect(() => setWelcomeDraft(config.welcomeLine), [config.welcomeLine]);

  // Tapping a section on the preview brings its controls into view; the
  // welcome ghost goes straight into typing.
  React.useEffect(() => {
    if (!selected) return;
    cardRefs.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (selected === 'welcome') welcomeInputRef.current?.focus();
  }, [selected]);

  function commitWelcome() {
    const trimmed = welcomeDraft.trim();
    setWelcomeDraft(trimmed);
    if (trimmed !== config.welcomeLine) onChange({ welcomeLine: trimmed });
  }

  const ref = (id: SectionId) => (el: HTMLDivElement | null) => {
    cardRefs.current[id] = el;
  };

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
      id: 'reactions',
      title: t('host.display.reactions'),
      desc: t('host.display.reactionsDesc'),
      on: config.showReactions,
      flip: () => onChange({ showReactions: !config.showReactions }),
    },
  ];

  return (
    <div className={p.rail}>
      <div className={p.railHint}>{t('host.display.dragEverything')}</div>

      <RailCard selected={selected} onSelect={onSelect}>
        <div className={styles.spLabel}>{t('host.display.theme')}</div>
        <div className={p.swatches}>
          {THEMES.map(({ id, dot }) => (
            <button
              key={id}
              className={`${p.swatch} ${config.theme === id ? p.swatchActive : ''}`}
              onClick={() => onChange({ theme: id })}
            >
              <span className={`${p.swatchDot} ${dot}`} />
              {t(`host.display.theme.${id}`)}
            </button>
          ))}
        </div>
      </RailCard>

      {toggles.map(({ id, title, desc, on, flip }) => (
        <RailCard key={id} id={id} selected={selected} onSelect={onSelect} cardRef={ref(id)}>
          <button className={styles.spToggleRow} onClick={flip}>
            {desc ? (
              <div>
                <div className={styles.spBtnTitle}>{title}</div>
                <div className={styles.spBtnDesc}>{desc}</div>
              </div>
            ) : (
              <div className={styles.spBtnTitle}>{title}</div>
            )}
            <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
        </RailCard>
      ))}

      <RailCard id="welcome" selected={selected} onSelect={onSelect} cardRef={ref('welcome')}>
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

      <RailCard id="attract" selected={selected} onSelect={onSelect} cardRef={ref('attract')}>
        <button
          className={styles.spToggleRow}
          onClick={() => onChange({ attractMode: !config.attractMode })}
        >
          <div>
            <div className={styles.spBtnTitle}>{t('host.display.attract')}</div>
            <div className={styles.spBtnDesc}>{t('host.display.attractDesc')}</div>
          </div>
          <div className={`${styles.toggle} ${config.attractMode ? styles.toggleOn : ''}`}>
            <div className={styles.toggleThumb} />
          </div>
        </button>
      </RailCard>
    </div>
  );
}
