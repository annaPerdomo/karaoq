import * as React from 'react';
import { useT } from '../../lib/i18n/I18nProvider';
import { DisplayTheme } from '../../pages/api/types';
import { BannerCard, RailShell, ThemeCard, ToggleCard, useRailCardRefs } from './Rail';

/** One hideable section as the rail lists it. Surfaces resolve `on`/`flip`
 * themselves because not every toggle maps to a config field — the display's
 * boards live in room state, outside DisplayConfig. */
export interface RailToggle<Id extends string> {
  id: Id;
  labelKey: string;
  descKey?: string;
  on: boolean;
  flip: () => void;
}

/** The Customize rail for both surfaces: theme, then each surface's toggles,
 * then the banner. Host and display differ only in the toggle list they pass. */
export function ConfigRail<Id extends string>({
  side,
  hintKey,
  theme,
  onPickTheme,
  toggles,
  bannerId,
  bannerLine,
  onBannerChange,
  selected,
  onSelect,
}: {
  side: 'left' | 'right';
  hintKey: string;
  theme: DisplayTheme;
  onPickTheme: (theme: DisplayTheme) => void;
  toggles: RailToggle<Id>[];
  bannerId: Id;
  bannerLine: string;
  onBannerChange: (line: string) => void;
  selected: Id | null;
  onSelect: (section: Id | null) => void;
}) {
  const { t } = useT();
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  const cardRef = useRailCardRefs<Id>(selected, (id) => {
    if (id === bannerId) bannerInputRef.current?.focus();
  });

  return (
    <RailShell side={side} hint={t(hintKey)}>
      <ThemeCard<Id>
        theme={theme}
        onPick={onPickTheme}
        selected={selected}
        onSelect={onSelect}
      />

      {toggles.map(({ id, labelKey, descKey, on, flip }) => (
        <ToggleCard
          key={id}
          id={id}
          title={t(labelKey)}
          desc={descKey ? t(descKey) : undefined}
          on={on}
          onFlip={flip}
          selected={selected}
          onSelect={onSelect}
          cardRef={cardRef(id)}
        />
      ))}

      <BannerCard
        id={bannerId}
        value={bannerLine}
        onChange={onBannerChange}
        selected={selected}
        onSelect={onSelect}
        cardRef={cardRef(bannerId)}
        inputRef={bannerInputRef}
      />
    </RailShell>
  );
}
