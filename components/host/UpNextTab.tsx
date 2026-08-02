import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { QueueEstimate, etaLabel, runsPastEnd, slotFor } from "../../lib/queueTime";
import { Icons } from "./icons";
import { SortableQueueItem } from "./SortableQueueItem";
import { QueueTimeLine } from "./QueueTimeLine";

/** The running order the host reorders: counts, timing, and the sortable list. */
export function UpNextTab({
  upNext,
  uniqueSingers,
  estimate,
  sessionEndsAt,
  fairMode,
  onToggleFairMode,
  editingId,
  onDragStart,
  onDragEnd,
  onMoveTop,
  onToggleEdit,
  onEditSave,
  onRequestRemove,
}: {
  upNext: QueueEntry[];
  uniqueSingers: number;
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  fairMode: boolean;
  onToggleFairMode: () => void;
  editingId: string | null;
  onDragStart: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onMoveTop: (id: string) => void;
  onToggleEdit: (id: string) => void;
  onEditSave: (id: string, name: string) => void;
  onRequestRemove: (id: string) => void;
}) {
  const { t, tn } = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <>
      <div className={styles.queueStats}>
        {upNext.length > 0 && (
          <>
            <span>{tn("host.stats.songs", upNext.length)}</span>
            <span className={styles.statDot} />
            <span>{tn("host.stats.singers", uniqueSingers)}</span>
          </>
        )}
        <button
          className={`${styles.fairToggle} ${fairMode ? styles.fairToggleOn : ""}`}
          onClick={onToggleFairMode}
          aria-pressed={fairMode}
          title={fairMode ? t("host.settings.fairOn") : t("host.settings.fairOff")}
        >
          {Icons.shuffle}
          {t("host.settings.fair")}
          <span
            className={`${styles.fairSwitch} ${fairMode ? styles.fairSwitchOn : ""}`}
          >
            <span className={styles.fairSwitchThumb} />
          </span>
        </button>
      </div>

      <QueueTimeLine estimate={estimate} sessionEndsAt={sessionEndsAt} />

      {upNext.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          // onDragStart pauses polling — a poll landing mid-drag re-renders
          // the SortableContext and the drop hits the wrong neighbor.
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={upNext.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={styles.queueList}>
              {upNext.map((item, i) => {
                const slot = slotFor(estimate, item.id);
                return (
                  <SortableQueueItem
                    key={item.id}
                    item={item}
                    index={i}
                    isFirst={i === 0}
                    editing={editingId === item.id}
                    eta={slot ? etaLabel(slot.startsInSeconds, t) : undefined}
                    afterEnd={runsPastEnd(slot, sessionEndsAt)}
                    onMoveTop={() => onMoveTop(item.id)}
                    onEdit={() => onToggleEdit(item.id)}
                    onEditSave={(name) => onEditSave(item.id, name)}
                    onRemove={() => onRequestRemove(item.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className={styles.emptyQueue}>{t("host.sidebar.noQueued")}</p>
      )}
    </>
  );
}
