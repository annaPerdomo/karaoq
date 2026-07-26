import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
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
}: {
  rail: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onDiscard: () => void;
  onSave: () => void;
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
            {t('customize.side.left')}
          </div>
          <div
            className={`${p.dropZone} ${p.dropZoneR} ${sideDragTarget === 'right' ? p.dropZoneActive : ''}`}
          >
            {t('customize.side.right')}
          </div>
        </>
      )}
    </>
  );
}
