import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { decodeHtml } from "./utils";

export function ConfirmRemoveModal({
  entryId,
  queue,
  onCancel,
  onConfirm,
}: {
  entryId: string;
  queue: QueueEntry[];
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  const { t } = useT();
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{t('host.confirm.title')}</h3>
        <p className={styles.modalText}>
          {(() => {
            const entry = queue.find((e) => e.id === entryId);
            if (!entry) return t('host.confirm.fallback');
            return t('host.confirm.body', { title: decodeHtml(entry.songTitle), name: entry.userName });
          })()}
        </p>
        <div className={styles.modalActions}>
          <button
            className={styles.btnDanger}
            onClick={() => onConfirm(entryId)}
          >
            {t('host.confirm.remove')}
          </button>
          <button
            className={styles.btnGhost}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
