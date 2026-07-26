import * as React from 'react';
import p from '../../styles/DisplayDesigner.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

export function EditBar({
  dirty,
  saving,
  saveFailed,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useT();
  return (
    <div className={p.bar}>
      <span className={`${p.actionsHint} ${saveFailed ? p.actionsHintError : ''}`}>
        {saveFailed
          ? t('host.display.saveFailed')
          : dirty
            ? t('host.display.unsaved')
            : t('host.display.synced')}
      </span>
      {dirty ? (
        <>
          <button className={p.discardBtn} onClick={onDiscard} disabled={saving}>
            {t('host.display.discard')}
          </button>
          <button className={p.applyBtn} onClick={onSave} disabled={saving}>
            {t('host.display.apply')}
          </button>
        </>
      ) : (
        <button className={p.doneBtn} onClick={onDiscard}>
          {t('host.display.done')}
        </button>
      )}
    </div>
  );
}
