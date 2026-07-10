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
import { QRCodeSVG } from "qrcode.react";
import styles from "../../styles/Host.module.css";
import CheerBar from "../CheerBar";
import SocialBoards from "../SocialBoards";
import SongSearch from "../SongSearch";
import {
  QueueEntry,
  SingWithMePost,
  SuggestedSong,
} from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { decodeHtml } from "./utils";
import { SortableQueueItem } from "./SortableQueueItem";

// The right-hand rail: the Up Next / History tabs, the add-song button and
// search overlay, the drag-reorderable queue, the history list, and the bottom
// drawers (cheers, singer boards, join QR shelf). Rendered for host and co-host
// alike; the drawers guard their host-only bits with `remote`.
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
  upNext,
  historyItems,
  uniqueSingers,
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
  singWithMe,
  suggestions,
  boardsOpen,
  onToggleBoards,
  hostName,
  onRefreshBoards,
  joinUrl,
  displayUrl,
  qrShelfOpen,
  onToggleQrShelf,
  onOpenQrModal,
  onSongAdded,
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
  upNext: QueueEntry[];
  historyItems: QueueEntry[];
  uniqueSingers: number;
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
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  boardsOpen: boolean;
  onToggleBoards: () => void;
  hostName: string;
  onRefreshBoards: () => void;
  joinUrl: string;
  displayUrl: string;
  qrShelfOpen: boolean;
  onToggleQrShelf: () => void;
  onOpenQrModal: () => void;
  onSongAdded: (entry: QueueEntry) => void;
}) {
  const { t, tn } = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div
      className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""} ${!remote && roomEmpty ? styles.sidebarEmptyMobile : ""}`}
    >
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
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTabs}>
              <button
                className={`${styles.sidebarTab} ${sidebarTab === "queue" ? styles.sidebarTabActive : ""}`}
                onClick={() => onSelectTab("queue")}
              >
                {t('host.sidebar.upNext')}
                {upNext.length > 0 && (
                  <span className={styles.sidebarBadge}>
                    {upNext.length}
                  </span>
                )}
              </button>
              <button
                className={`${styles.sidebarTab} ${sidebarTab === "history" ? styles.sidebarTabActive : ""}`}
                onClick={() => onSelectTab("history")}
              >
                {t('host.sidebar.history')}
                {historyItems.length > 0 && (
                  <span className={styles.historyBadge}>
                    {historyItems.length}
                  </span>
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
              {upNext.length > 0 && (
                <div className={styles.queueStats}>
                  <span>
                    {tn('host.stats.songs', upNext.length)}
                  </span>
                  <span className={styles.statDot} />
                  <span>
                    {tn('host.stats.singers', uniqueSingers)}
                  </span>
                </div>
              )}

              {upNext.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  // Pause polling the moment a drag starts — a poll landing
                  // mid-drag re-renders the SortableContext and the drop hits
                  // the wrong neighbor.
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
                    <span className={styles.historyNum}>
                      {historyItems.length - i}
                    </span>
                    <div className={styles.queueInfo}>
                      <div className={styles.queueArtist} title={item.userName}>
                        {item.userName}
                      </div>
                      <div
                        className={styles.queueSong}
                        title={decodeHtml(item.songTitle)}
                      >
                        {decodeHtml(item.songTitle)}
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

          {/* Bottom cluster, pinned below the queue:
              - Cheers, contextual (only while a song is on stage).
              - The "Scan to join" QR card (same component/wording as the
                Display screen) so guests can scan all night, with its own
                print + hide controls. A host can tuck it away (remembered
                per-room) and restore it from the slim "Show join code"
                button. */}
          <div className={styles.sidebarBottom}>
            {!remote && reactionsOn && isPlaying && currentSong && (
              <>
                <button
                  className={`${styles.drawerToggle} ${cheersOpen ? styles.drawerToggleOpen : ""}`}
                  onClick={onToggleCheers}
                  aria-expanded={cheersOpen}
                >
                  <svg
                    className={styles.drawerCaret}
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="currentColor"
                  >
                    <path d="M0 0l5 6 5-6z" />
                  </svg>
                  {t('host.cheers')}
                </button>
                {cheersOpen && (
                  <div className={styles.cheersLive}>
                    <CheerBar
                      onReaction={onSendReaction}
                      cooldown={reactionCooldown}
                      lastSentEmoji={lastSentEmoji}
                      compact
                    />
                  </div>
                )}
              </>
            )}
            {joinCode && (singWithMe.length > 0 || suggestions.length > 0) && (
              <>
                <button
                  className={`${styles.drawerToggle} ${boardsOpen ? styles.drawerToggleOpen : ""}`}
                  onClick={onToggleBoards}
                  aria-expanded={boardsOpen}
                >
                  <svg
                    className={styles.drawerCaret}
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="currentColor"
                  >
                    <path d="M0 0l5 6 5-6z" />
                  </svg>
                  {t('host.singerBoards')}
                  <span className={styles.boardsCount}>
                    {singWithMe.length + suggestions.length}
                  </span>
                </button>
                {boardsOpen && (
                  <div className={styles.boardsShelf}>
                    <SocialBoards
                      roomId={joinCode}
                      userName={hostName || "Host"}
                      singWithMe={singWithMe}
                      suggestions={suggestions}
                      mode="host"
                      onChange={onRefreshBoards}
                    />
                  </div>
                )}
              </>
            )}
            {!remote && joinUrl && (
              <>
                <button
                  className={`${styles.drawerToggle} ${qrShelfOpen ? styles.drawerToggleOpen : ""}`}
                  onClick={onToggleQrShelf}
                  aria-expanded={qrShelfOpen}
                >
                  <svg
                    className={styles.drawerCaret}
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="currentColor"
                  >
                    <path d="M0 0l5 6 5-6z" />
                  </svg>
                  {t('host.scanToJoin')}
                </button>
                {qrShelfOpen && (
                  <div className={styles.qrShelf}>
                    <button
                      className={styles.qrShelfThumb}
                      onClick={onOpenQrModal}
                      title={t('host.qr.enlarge')}
                      aria-label={t('host.qr.enlarge')}
                    >
                      <QRCodeSVG
                        value={joinUrl}
                        size={72}
                        bgColor="transparent"
                        fgColor="#ffffff"
                        level="M"
                      />
                    </button>
                    <div className={styles.qrShelfInfo}>
                      <span className={styles.qrShelfHint}>
                        {t('host.qr.tapEnlarge')}
                      </span>
                      <span className={styles.qrShelfAlt}>
                        {t('host.qr.orVisitEnter').split(/(\{url\})/).map((part, i) =>
                          part === '{url}'
                            ? <strong key={i}>{displayUrl}</strong>
                            : <React.Fragment key={i}>{part}</React.Fragment>
                        )}
                      </span>
                      <span className={styles.qrShelfCode}>
                        {(joinCode || "").toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

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
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
