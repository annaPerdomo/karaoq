import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import styles from '../../styles/Host.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { MAX_BANNER_LENGTH } from '../../lib/limits';
import { DisplayTheme } from '../../pages/api/types';
import { THEMES } from './themes';

/** The floating settings rail both Customize modes dock to the free viewport
 * edge — always the side the sidebar is NOT on, so it never covers the thing
 * being edited. Each surface fills it with its own cards. */
export function RailShell({
  side,
  hint,
  children,
}: {
  side: 'left' | 'right';
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${p.rail} ${side === 'left' ? p.railLeft : p.railRight}`}
      // The rail renders inside the page's <main>, whose click clears the
      // section selection. Without this a card would select and immediately
      // deselect in the same event, and no rail control could hold a selection.
      onClick={(e) => e.stopPropagation()}
    >
      <div className={p.railHint}>{hint}</div>
      {children}
    </div>
  );
}

/** One card in the rail. Cards tied to a page section highlight when that
 * section is selected and select it when clicked; standalone cards (theme,
 * boards) pass no id. Generic over each surface's section-id union. */
export function RailCard<Id extends string>({
  id,
  selected,
  onSelect,
  cardRef,
  children,
}: {
  id?: Id;
  selected: Id | null;
  onSelect: (section: Id | null) => void;
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

/** A labelled on/off row — the shape every show/hide toggle takes. */
export function ToggleRow({
  title,
  desc,
  on,
  onFlip,
}: {
  title: string;
  desc?: string;
  on: boolean;
  onFlip: () => void;
}) {
  return (
    <button className={styles.spToggleRow} onClick={onFlip}>
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
  );
}

/** A section's show/hide card: the toggle row wrapped in a selectable card. */
export function ToggleCard<Id extends string>({
  id,
  title,
  desc,
  on,
  onFlip,
  selected,
  onSelect,
  cardRef,
}: {
  id?: Id;
  title: string;
  desc?: string;
  on: boolean;
  onFlip: () => void;
  selected: Id | null;
  onSelect: (section: Id | null) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <RailCard id={id} selected={selected} onSelect={onSelect} cardRef={cardRef}>
      <ToggleRow title={title} desc={desc} on={on} onFlip={onFlip} />
    </RailCard>
  );
}

/** The palette picker, identical on both surfaces. */
export function ThemeCard<Id extends string>({
  theme,
  onPick,
  selected,
  onSelect,
}: {
  theme: DisplayTheme;
  onPick: (theme: DisplayTheme) => void;
  selected: Id | null;
  onSelect: (section: Id | null) => void;
}) {
  const { t } = useT();
  return (
    <RailCard<Id> selected={selected} onSelect={onSelect}>
      <div className={styles.spLabel}>{t('host.display.theme')}</div>
      <div className={p.swatches}>
        {THEMES.map(({ id, dot }) => (
          <button
            key={id}
            className={`${p.swatch} ${theme === id ? p.swatchActive : ''}`}
            onClick={() => onPick(id)}
          >
            <span className={`${p.swatchDot} ${dot}`} />
            {t(`host.display.theme.${id}`)}
          </button>
        ))}
      </div>
    </RailCard>
  );
}

/** The announcement banner's text input, identical on both surfaces. Every
 * keystroke flows straight into the staged draft, so the banner on the page
 * updates live as the host types (nothing reaches the room until Save);
 * blur just trims. */
export function BannerCard<Id extends string>({
  id,
  value,
  onChange,
  selected,
  onSelect,
  cardRef,
  inputRef,
}: {
  id: Id;
  value: string;
  onChange: (line: string) => void;
  selected: Id | null;
  onSelect: (section: Id | null) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { t } = useT();
  return (
    <RailCard id={id} selected={selected} onSelect={onSelect} cardRef={cardRef}>
      <div className={styles.spLabel}>{t('host.display.banner')}</div>
      <input
        ref={inputRef}
        className={styles.dpWelcomeInput}
        type="text"
        value={value}
        maxLength={MAX_BANNER_LENGTH}
        placeholder={t('host.display.bannerPh')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const trimmed = value.trim();
          if (trimmed !== value) onChange(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </RailCard>
  );
}

/** Scrolls a section's rail card into view when that section is selected on the
 * page, so tapping an element always reveals its controls. */
export function useRailCardRefs<Id extends string>(
  selected: Id | null,
  onReveal?: (id: Id) => void
) {
  const cardRefs = React.useRef<Partial<Record<Id, HTMLDivElement | null>>>({});

  React.useEffect(() => {
    if (!selected) return;
    cardRefs.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onReveal?.(selected);
    // onReveal is re-created each render; selection is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (id: Id) => (el: HTMLDivElement | null) => {
    cardRefs.current[id] = el;
  };
}
