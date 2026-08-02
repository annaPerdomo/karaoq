import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { formatSongTitle } from "./utils";

export function SortableQueueItem({
  item,
  index,
  isFirst,
  editing,
  eta,
  afterEnd = false,
  onMoveTop,
  onEdit,
  onEditSave,
  onRemove,
}: {
  item: QueueEntry;
  index: number;
  isFirst: boolean;
  editing: boolean;
  /** "in ~12 min" / "up next" / "on stage". Absent while the queue is unknown. */
  eta?: string;
  /** This one is expected to still be running when the room's time is up. */
  afterEnd?: boolean;
  onMoveTop: () => void;
  onEdit: () => void;
  onEditSave: (name: string) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const [editName, setEditName] = React.useState(item.userName);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setEditName(item.userName);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [editing, item.userName]);

  const save = () => onEditSave(editName);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.queueItem} ${isDragging ? styles.queueItemDragging : ""} ${editing ? styles.queueItemEditing : ""}`}
    >
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label={t('host.queue.dragReorder')}
      >
        {Icons.drag}
      </button>
      <span className={styles.queueNum}>{index + 1}</span>
      <div className={styles.queueInfo}>
        <div className={styles.queueSingerLine}>
          {editing ? (
            <input
              ref={inputRef}
              className={styles.editInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") onEditSave(item.userName);
              }}
            />
          ) : (
            <span className={styles.queueSingerName} title={item.userName}>
              {item.userName}
            </span>
          )}
        </div>
        <div className={styles.queueSong} title={formatSongTitle(item.songTitle)}>
          {formatSongTitle(item.songTitle)}
        </div>
        {eta && (
          <div className={styles.queueEta}>
            {eta}
            {afterEnd && (
              <span className={styles.queueEtaOver}>
                {t('queue.eta.afterEnd')}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.queueActions}>
        {!isFirst && (
          <button
            className={styles.actionBtn}
            onClick={onMoveTop}
            title={t('host.queue.moveTop')}
            aria-label={t('host.queue.moveTop')}
          >
            {Icons.moveTop}
          </button>
        )}
        <button
          className={`${styles.actionBtn} ${editing ? styles.actionBtnActive : ""}`}
          onClick={onEdit}
          title={t('host.queue.editName')}
          aria-label={t('host.queue.editName')}
        >
          {Icons.edit}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.removeBtn}`}
          onClick={onRemove}
          title={t('host.queue.remove')}
          aria-label={t('host.queue.remove')}
        >
          {Icons.remove}
        </button>
      </div>
    </div>
  );
}
