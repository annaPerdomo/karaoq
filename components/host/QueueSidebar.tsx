import * as React from "react";
import type { RoomTiming } from "../hooks/useRoomTiming";
import { DragEndEvent } from "@dnd-kit/core";
import styles from "../../styles/Host.module.css";
import p from "../../styles/DisplayDesigner.module.css";
import BoardsPanel from "../BoardsPanel";
import SongSearch from "../SongSearch";
import { HostConfig, QueueEntry } from "../../pages/api/types";
import { Boards } from "../../app/queue/useBoards";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { SidebarSections, HostSidebarEdit } from "./SidebarSections";
import { UpNextTab } from "./UpNextTab";
import { HistoryTab } from "./HistoryTab";
import { MusicVideoCard, musicVideoCardVisible } from "./MusicVideoCard";
import { QueueEstimate } from "../../lib/queueTime";

export function QueueSidebar({
  remote,
  roomEmpty,
  stageOffersAdd,
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
  onReplayFromHistory,
  reactionsOn,
  isPlaying,
  currentSong,
  musicVideoAt,
  songClock,
  onSwapVideo,
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
  /** EmptyStage shows its own Add; phones hide this one. */
  stageOffersAdd: boolean;
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
  /** Running order with a clock against it — see lib/queueTime. */
  estimate: QueueEstimate;
  /** Epoch ms the room has to be out by; null when open-ended. */
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
  onReplayFromHistory: (id: string) => void;
  reactionsOn: boolean;
  isPlaying: boolean;
  currentSong: QueueEntry | undefined;
  /** Room.musicVideoAt, as an ISO string — gates the music-video swap card. */
  musicVideoAt: string | null;
  songClock: Pick<RoomTiming, "playStartedAt" | "playPausedAt">;
  /** Absent for co-hosts. */
  onSwapVideo?: (entryId: string) => void;
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
  const { t } = useT();

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
        className={`${styles.addSongBtn} ${searchOpen ? styles.addSongBtnActive : ""} ${stageOffersAdd ? styles.addSongBtnStageDup : ""}`}
        onClick={onToggleSearch}
      >
        {Icons.plus} {t('host.sidebar.addSong')}
      </button>

      {joinCode && musicVideoCardVisible(remote, musicVideoAt, currentSong) && (
        <MusicVideoCard
          joinCode={joinCode}
          activeEntry={currentSong as QueueEntry}
          playback={{ isPlaying, ...songClock }}
        />
      )}

      {sidebarTab === "queue" && (
        <UpNextTab
          upNext={upNext}
          uniqueSingers={uniqueSingers}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
          fairMode={fairMode}
          onToggleFairMode={onToggleFairMode}
          editingId={editingId}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMoveTop={onMoveTop}
          onToggleEdit={onToggleEdit}
          onEditSave={onEditSave}
          onSwapVideo={onSwapVideo}
          onRequestRemove={onRequestRemove}
        />
      )}

      {sidebarTab === "history" && (
        <HistoryTab
          historyItems={historyItems}
          onReplayFromHistory={onReplayFromHistory}
        />
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
            ⋮⋮ {t('customize.dragHint')}
          </button>
          <button
            className={`${p.widthHandle} ${hostConfig.sidebarPosition === "right" ? p.widthHandleL : p.widthHandleR}`}
            title={t('customize.dragWidth')}
            aria-label={t('edit.handle.sidebarWidth')}
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
