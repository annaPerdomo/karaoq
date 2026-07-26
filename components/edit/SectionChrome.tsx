import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { HideButton } from './EditChrome';

export function SectionChrome({
  gripProps,
  onHide,
  children,
}: {
  gripProps: React.ComponentProps<'button'>;
  onHide?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <div className={p.chrome}>
        <button
          className={`${p.chromeBtn} ${p.gripBtn}`}
          title={t('customize.dragReorder')}
          aria-label={t('customize.dragReorder')}
          {...gripProps}
        >
          ⋮⋮
        </button>
        {onHide && <HideButton title={t('customize.hide')} onHide={onHide} />}
      </div>
      {children}
    </>
  );
}

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
