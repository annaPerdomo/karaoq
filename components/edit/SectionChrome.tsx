import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { HideButton } from './EditChrome';

/** A section's editing cluster: the reorder grip, plus an eye when the section
 * is allowed to be hidden. Sections that are essential (the host's queue) pass
 * no `onHide` and get a grip only. */
export function SectionChrome({
  gripProps,
  onHide,
  children,
}: {
  gripProps: React.ComponentProps<'button'>;
  onHide?: () => void;
  /** Extra handles for this section (e.g. a resize corner). */
  children?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <div className={p.chrome}>
        <button
          className={`${p.chromeBtn} ${p.gripBtn}`}
          title={t('host.display.dragReorder')}
          aria-label={t('host.display.dragReorder')}
          {...gripProps}
        >
          ⋮⋮
        </button>
        {onHide && <HideButton title={t('host.display.hide')} onHide={onHide} />}
      </div>
      {children}
    </>
  );
}

/** Stand-in for a hidden section — tapping it brings the section back. */
export function SectionGhost({
  label,
  className = '',
  onRestore,
}: {
  label: string;
  className?: string;
  onRestore: () => void;
}) {
  return (
    <button
      className={`${p.ghost} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onRestore();
      }}
    >
      {label}
    </button>
  );
}
