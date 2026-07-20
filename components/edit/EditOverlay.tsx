import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { SidebarPosition } from '../../pages/api/types';
import { EditBar } from './EditBar';

/** The floating chrome every Customize mode puts over its live page: the
 * settings rail on the free edge, the save bar, and the left/right drop zones
 * that appear while the sidebar is being dragged across the screen.
 *
 * The rail itself is per-surface (different cards), so it comes in as a slot. */
export function EditOverlay({
  rail,
  dirty,
  saving,
  saveFailed,
  onDiscard,
  onSave,
  sideDragTarget,
}: {
  rail: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onDiscard: () => void;
  onSave: () => void;
  /** Non-null while the sidebar is mid-flight; marks the landing side. */
  sideDragTarget: SidebarPosition | null;
}) {
  const { t } = useT();
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
      {sideDragTarget !== null && (
        <>
          <div
            className={`${p.dropZone} ${p.dropZoneL} ${sideDragTarget === 'left' ? p.dropZoneActive : ''}`}
          >
            {t('host.display.side.left')}
          </div>
          <div
            className={`${p.dropZone} ${p.dropZoneR} ${sideDragTarget === 'right' ? p.dropZoneActive : ''}`}
          >
            {t('host.display.side.right')}
          </div>
        </>
      )}
    </>
  );
}
