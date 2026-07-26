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
import p from "../../styles/DisplayDesigner.module.css";
import BoardsPanel from "../BoardsPanel";
import SongSearch from "../SongSearch";
import { HostConfig, QueueEntry } from "../../pages/api/types";
import { Boards } from "../../app/queue/useBoards";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { formatSongTitle } from "./utils";
import { SortableQueueItem } from "./SortableQueueItem";
import { SidebarSections, HostSidebarEdit } from "./SidebarSections";

export function QueueSidebar({
  remote,
  roomEmpty,
  sidebarCollapsed,
  onExpandSidebar,
  onCollapseSidebar,
  sidebarTab,
  onSelectTab,
  searchOpen,
  onToggleSearch,
  onCloseSearch,
  onOpenBoards,
  upNext,
  historyItems,
  uniqueSingers,
  fairMode,
  onToggleFairMode,
  editingId,
  onDragStart,
  onDragEnd,
  onMoveTop,
  onToggleEdit,
  onEditSave,
  onRequestRemove,
  onReplayFromHistory,
  reactionsOn,
  isPlaying,
  currentSong,
  cheersOpen,
  onToggleCheers,
  onSendReaction,
  reactionCooldown,
  lastSentEmoji,
  joinCode,
  boards,
  hostName,
  joinUrl,
  displayUrl,
  qrShelfOpen,
  onToggleQrShelf,
  onOpenQrModal,
  onSongAdded,
  hostConfig,
  hostEdit,
  hostEditing = false,
  sideDragProps,
  widthDragProps,
  sideDragging = false,
}: {
  remote: boolean;
  roomEmpty: boolean;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  onCollapseSidebar: () => void;
  sidebarTab: "queue" | "history";
  onSelectTab: (tab: "queue" | "history") => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onCloseSearch: () => void;
  onOpenBoards: () => void;
  upNext: QueueEntry[];
  historyItems: QueueEntry[];
  uniqueSingers: number;
  fairMode: boolean;
  onToggleFairMode: () => void;
  editingId: string | null;
  onDragStart: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onMoveTop: (id: string) => void;
  onToggleEdit: (id: string) => void;
  onEditSave: (id: string, name: string) => void;
  onRequestRemove: (id: string) => void;
  onReplayFromHistory: (id: string) => void;
  reactionsOn: boolean;
  isPlaying: boolean;
  currentSong: QueueEntry | undefined;
  cheersOpen: boolean;
  onToggleCheers: () => void;
  onSendReaction: (emoji: string) => void;
  reactionCooldown: boolean;
  lastSentEmoji: string | null;
  joinCode: string | undefined;
  boards: Boards;
  hostName: string;
  joinUrl: string;
  displayUrl: string;
  qrShelfOpen: boolean;
  onToggleQrShelf: () => void;
  onOpenQrModal: () => void;
  onSongAdded: (entry: QueueEntry) => void;
  /** Draft config while customizing, server-synced otherwise. */
  hostConfig: HostConfig;
  hostEdit?: HostSidebarEdit;
  hostEditing?: boolean;
  sideDragProps?: React.ComponentProps<"button">;
  widthDragProps?: React.ComponentProps<"button">;
  sideDragging?: boolean;
}) {
  const { t, tn } = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const queueNode = (
    <>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTabs}>
          <button
            className={`${styles.sidebarTab} ${sidebarTab === "queue" ? styles.sidebarTabActive : ""}`}
            onClick={() => onSelectTab("queue")}
          >
            {t('host.sidebar.upNext')}
            {upNext.length > 0 && (
              <span className={styles.sidebarBadge}>{upNext.length}</span>
            )}
          </button>
          <button
            className={`${styles.sidebarTab} ${sidebarTab === "history" ? styles.sidebarTabActive : ""}`}
            onClick={() => onSelectTab("history")}
          >
            {t('host.sidebar.history')}
            {historyItems.length > 0 && (
              <span className={styles.historyBadge}>{historyItems.length}</span>
            )}
          </button>
        </div>
        <button
          className={styles.sidebarCollapseBtn}
          onClick={onCollapseSidebar}
          title={t('host.sidebar.hidePanel')}
          aria-label={t('host.sidebar.hidePanel')}
        >
          {Icons.chevronRight}
        </button>
      </div>

      <button
        className={`${styles.addSongBtn} ${searchOpen ? styles.addSongBtnActive : ""}`}
        onClick={onToggleSearch}
      >
        {Icons.plus} {t('host.sidebar.addSong')}
      </button>

      {sidebarTab === "queue" && (
        <>
          <div className={styles.queueStats}>
            {upNext.length > 0 && (
              <>
                <span>{tn('host.stats.songs', upNext.length)}</span>
                <span className={styles.statDot} />
                <span>{tn('host.stats.singers', uniqueSingers)}</span>
              </>
            )}
            <button
              className={`${styles.fairToggle} ${fairMode ? styles.fairToggleOn : ""}`}
              onClick={onToggleFairMode}
              aria-pressed={fairMode}
              title={fairMode ? t('host.settings.fairOn') : t('host.settings.fairOff')}
            >
              {Icons.shuffle}
              {t('host.settings.fair')}
              <span
                className={`${styles.fairSwitch} ${fairMode ? styles.fairSwitchOn : ""}`}
              >
                <span className={styles.fairSwitchThumb} />
              </span>
            </button>
          </div>

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
                  {upNext.map((item, i) => (
                    <SortableQueueItem
                      key={item.id}
                      item={item}
                      index={i}
                      isFirst={i === 0}
                      editing={editingId === item.id}
                      onMoveTop={() => onMoveTop(item.id)}
                      onEdit={() => onToggleEdit(item.id)}
                      onEditSave={(name) => onEditSave(item.id, name)}
                      onRemove={() => onRequestRemove(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className={styles.emptyQueue}>{t('host.sidebar.noQueued')}</p>
          )}
        </>
      )}

      {sidebarTab === "history" && (
        <div className={styles.historyList}>
          {historyItems.length > 0 ? (
            [...historyItems].reverse().map((item, i) => (
              <div key={item.id} className={styles.historyItem}>
                <span className={styles.historyNum}>{historyItems.length - i}</span>
                <div className={styles.queueInfo}>
                  <div className={styles.queueArtist} title={item.userName}>
                    {item.userName}
                  </div>
                  <div
                    className={styles.queueSong}
                    title={formatSongTitle(item.songTitle)}
                  >
                    {formatSongTitle(item.songTitle)}
                  </div>
                </div>
                <button
                  className={styles.replayBtn}
                  onClick={() => onReplayFromHistory(item.id)}
                  title={t('host.history.restoreTitle')}
                  aria-label={t('host.history.restoreTitle')}
                >
                  {Icons.replay}
                  <span className={styles.replayBtnLabel}>{t('host.history.restore')}</span>
                </button>
              </div>
            ))
          ) : (
            <p className={styles.emptyQueue}>{t('host.history.empty')}</p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""} ${!remote && roomEmpty ? styles.sidebarEmptyMobile : ""} ${sideDragging ? p.sidebarDragging : ""}`}
    >
      {hostEditing && !sidebarCollapsed && (
        <>
          <button className={p.dragHandle} {...sideDragProps}>
            ⋮⋮ {t('host.display.dragHint')}
          </button>
          <button
            className={`${p.widthHandle} ${hostConfig.sidebarPosition === "right" ? p.widthHandleL : p.widthHandleR}`}
            title={t('host.display.dragWidth')}
            aria-label={t('host.display.dragWidth')}
            {...widthDragProps}
          />
        </>
      )}
      {sidebarCollapsed ? (
        <button
          className={styles.sidebarReopen}
          onClick={onExpandSidebar}
          title={t('host.sidebar.showQueue')}
          aria-label={t('host.sidebar.showQueue')}
        >
          <span className={styles.sidebarReopenIcon}>
            {Icons.chevronRight}
          </span>
          <span className={styles.sidebarReopenLabel}>{t('host.sidebar.upNext')}</span>
          {upNext.length > 0 && (
            <span className={styles.sidebarBadge}>{upNext.length}</span>
          )}
        </button>
      ) : (
        <>
          <SidebarSections
            queueNode={queueNode}
            remote={remote}
            reactionsOn={reactionsOn}
            isPlaying={isPlaying}
            currentSong={currentSong}
            cheersOpen={cheersOpen}
            onToggleCheers={onToggleCheers}
            onSendReaction={onSendReaction}
            reactionCooldown={reactionCooldown}
            lastSentEmoji={lastSentEmoji}
            joinCode={joinCode}
            boards={boards}
            onOpenBoards={onOpenBoards}
            joinUrl={joinUrl}
            displayUrl={displayUrl}
            qrShelfOpen={qrShelfOpen}
            onToggleQrShelf={onToggleQrShelf}
            onOpenQrModal={onOpenQrModal}
            config={hostConfig}
            edit={hostEdit}
          />

          {searchOpen && joinCode && (
            <div className={styles.searchOverlay}>
              <div className={styles.searchOverlayHead}>
                <button
                  className={styles.searchClose}
                  onClick={onCloseSearch}
                  title={t('host.search.close')}
                >
                  ×
                </button>
              </div>
              <SongSearch
                roomId={joinCode}
                userName={hostName || "Host"}
                onSongAdded={onSongAdded}
                showFilters={false}
                requireName={false}
                role="host"
                belowSearch={
                  <BoardsPanel
                    roomId={joinCode}
                    userName={hostName || "Host"}
                    boards={boards}
                    mode="host"
                  />
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
