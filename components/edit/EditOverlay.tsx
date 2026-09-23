import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { isTvDevice } from '../../lib/calmMotion';
import { SidebarPosition } from '../../pages/api/types';
import { EditBar } from './EditBar';

export function EditOverlay({
  rail,
  dirty,
  saving,
  saveFailed,
  onDiscard,
  onSave,
  sideDragTarget,
  sidebarPosition,
  onFlipSide,
}: {
  rail: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onDiscard: () => void;
  onSave: () => void;
  sideDragTarget: SidebarPosition | null;
  sidebarPosition: SidebarPosition;
  onFlipSide: (side: SidebarPosition) => void;
}) {
  const { t } = useT();
  const dragging = sideDragTarget !== null;
  const otherSide: SidebarPosition = sidebarPosition === 'left' ? 'right' : 'left';
  return (
    <>
      {rail}
      <EditBar
        dirty={dirty}
        saving={saving}
        saveFailed={saveFailed}
        onDiscard={onDiscard}
        onSave={onSave}
      />
      {dragging ? (
        (['left', 'right'] as SidebarPosition[]).map((side) => (
          <button
            key={side}
            type="button"
            className={`${p.dropZone} ${side === 'left' ? p.dropZoneL : p.dropZoneR} ${sideDragTarget === side ? p.dropZoneActive : ''}`}
            aria-label={t('edit.moveSidebarHere')}
            onClick={() => onFlipSide(side)}
          >
            {t(side === 'left' ? 'customize.side.left' : 'customize.side.right')}
          </button>
        ))
      ) : isTvDevice() ? (
        // Rail lives on this same side; .sideFlipPill clears its inner edge.
        <button
          type="button"
          className={`${p.sideFlipPill} ${otherSide === 'left' ? p.sideFlipPillL : p.sideFlipPillR}`}
          aria-label={t('edit.moveSidebarHere')}
          onClick={() => onFlipSide(otherSide)}
        >
          {otherSide === 'left' ? '← ' : ''}
          {t('edit.moveSidebarHere')}
          {otherSide === 'right' ? ' →' : ''}
        </button>
      ) : null}
    </>
  );
}
