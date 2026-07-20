import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import styles from "../../styles/Host.module.css";
import p from "../../styles/DisplayDesigner.module.css";
import CheerBar from "../CheerBar";
import BoardsSummary from "../boards/BoardsSummary";
import { HostConfig, HostSection, QueueEntry } from "../../pages/api/types";
import { QR_PX_MIN, QR_PX_MAX } from "../../lib/limits";
import { Boards } from "../../app/queue/useBoards";
import { useT } from "../../lib/i18n/I18nProvider";
import { Spot } from "../edit/EditChrome";
import { SectionChrome, SectionGhost } from "../edit/SectionChrome";
import { useSectionReorder } from "../edit/hooks/useSectionReorder";
import { useScalarDrag } from "../edit/hooks/useScalarDrag";
import { HostSectionId } from "./edit/useHostEdit";

/** Present only in Customize mode — the same sections then grow drag grips,
 * outlines, and ghosts. */
export interface HostSidebarEdit {
  selected: HostSectionId | null;
  onSelect: (section: HostSectionId | null) => void;
  onChange: (patch: Partial<HostConfig>) => void;
}

interface SidebarSectionsProps {
  /** The queue section's contents: tabs + add button + queue/history list. */
  queueNode: React.ReactNode;
  remote: boolean;
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
  onOpenBoards: () => void;
  joinUrl: string;
  displayUrl: string;
  qrShelfOpen: boolean;
  onToggleQrShelf: () => void;
  onOpenQrModal: () => void;
  /** The host config view (draft while editing) — drives order + visibility. */
  config: HostConfig;
  edit?: HostSidebarEdit;
}

const SECTION_LABEL: Record<HostSection, string> = {
  queue: "host.customize.queue",
  boards: "host.customize.boards",
  qr: "host.customize.qr",
};

/** The host sidebar's arrangeable sections: the queue itself, the boards
 * roll-up, and the join-QR shelf. In Customize mode the REAL sections become
 * the editing surface — drag the grip to reorder, the eye to hide; ghosts
 * restore hidden ones. The queue grows to fill, so whatever sits after it is
 * pushed to the bottom whichever order the host picks. The cheer bar is pinned
 * last and is not customizable: it's governed by the gear's reactions setting. */
export function SidebarSections({
  queueNode,
  remote,
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
  onOpenBoards,
  joinUrl,
  displayUrl,
  qrShelfOpen,
  onToggleQrShelf,
  onOpenQrModal,
  config,
  edit,
}: SidebarSectionsProps) {
  const { t } = useT();
  const { sectionOrder } = config;

  // Drag the QR's corner to resize it, same interaction as the display's.
  const qrDrag = useScalarDrag({
    value: config.qrPx,
    min: QR_PX_MIN,
    max: QR_PX_MAX,
    onChange: (qrPx) => edit?.onChange({ qrPx }),
  });

  // Which sections have the underlying data to appear at all.
  const dataReady: Record<HostSection, boolean> = {
    queue: true,
    boards: !!joinCode,
    qr: !remote && !!joinUrl,
  };

  // The queue can be moved but never hidden — without it there's no host page.
  const shown: Record<HostSection, boolean> = {
    queue: true,
    boards: config.showBoards,
    qr: config.showQr,
  };

  const visible: Record<HostSection, boolean> = {
    queue: dataReady.queue && shown.queue,
    boards: dataReady.boards && shown.boards,
    qr: dataReady.qr && shown.qr,
  };

  const { lifted, gripProps, sectionRef } = useSectionReorder<HostSection>({
    order: sectionOrder,
    visible,
    onReorder: (sectionOrder) => edit?.onChange({ sectionOrder }),
  });

  const ghost = (id: HostSection, restore: () => void) => (
    <SectionGhost
      key={id}
      label={t("host.display.hiddenTap", { section: t(SECTION_LABEL[id]) })}
      onRestore={() => {
        restore();
        edit?.onSelect(id);
      }}
    />
  );

  const boardsLive = (
    <div className={styles.boardsShelf}>
      <BoardsSummary
        singWithMe={boards.singWithMe}
        suggestions={boards.suggestions}
        onOpen={onOpenBoards}
      />
    </div>
  );

  const qrLive = (
    <>
      <button
        className={`${styles.drawerToggle} ${qrShelfOpen ? styles.drawerToggleOpen : ""}`}
        onClick={onToggleQrShelf}
        aria-expanded={qrShelfOpen}
      >
        <svg className={styles.drawerCaret} width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
          <path d="M0 0l5 6 5-6z" />
        </svg>
        {t("host.scanToJoin")}
      </button>
      {/* While customizing the shelf always renders — a tucked-away QR can't be
          resized, and its drawer toggle is inert in edit mode. */}
      {(qrShelfOpen || !!edit) && (
        <div className={styles.qrShelf}>
          <button
            className={styles.qrShelfThumb}
            // The thumb grows with the code (+12 keeps its 6px inset), otherwise
            // the fixed 80px frame would crop anything the host drags larger.
            style={{ width: config.qrPx + 12, height: config.qrPx + 12 }}
            onClick={onOpenQrModal}
            title={t("host.qr.enlarge")}
            aria-label={t("host.qr.enlarge")}
          >
            <QRCodeSVG
              value={joinUrl}
              size={config.qrPx}
              bgColor="transparent"
              fgColor="#ffffff"
              level="M"
            />
          </button>
          <div className={styles.qrShelfInfo}>
            <span className={styles.qrShelfHint}>{t("host.qr.tapEnlarge")}</span>
            <span className={styles.qrShelfAlt}>
              {t("host.qr.orVisitEnter")
                .split(/(\{url\})/)
                .map((part, i) =>
                  part === "{url}" ? (
                    <strong key={i}>{displayUrl}</strong>
                  ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                  )
                )}
            </span>
            <span className={styles.qrShelfCode}>{(joinCode || "").toUpperCase()}</span>
          </div>
        </div>
      )}
    </>
  );

  const liveNode: Record<HostSection, React.ReactNode> = {
    queue: queueNode,
    boards: boardsLive,
    qr: qrLive,
  };

  const hidePatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: false },
    qr: { showQr: false },
  };
  const showPatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: true },
    qr: { showQr: true },
  };

  // Only the queue grows; the rest size to content, so any order lays out right.
  const blockClass = (section: HostSection) =>
    section === "queue" ? styles.sectionGrow : styles.sectionBlock;

  function renderSection(section: HostSection): React.ReactNode {
    if (!dataReady[section]) return null;
    if (!edit) {
      return visible[section] ? (
        <div key={section} className={blockClass(section)}>
          {liveNode[section]}
        </div>
      ) : null;
    }
    if (!shown[section]) return ghost(section, () => edit.onChange(showPatch[section]));
    return (
      <div
        key={section}
        ref={sectionRef(section)}
        className={`${blockClass(section)} ${lifted === section ? p.sectionLifted : ""}`}
      >
        <Spot
          id={section}
          selected={edit.selected}
          onSelect={edit.onSelect}
          label={t(SECTION_LABEL[section])}
          className={section === "queue" ? p.grow : ""}
          chrome={
            <SectionChrome
              gripProps={gripProps(section)}
              // The queue has no eye — it can be moved but not hidden.
              onHide={
                section === "queue" ? undefined : () => edit.onChange(hidePatch[section])
              }
            >
              {section === "qr" && (
                <button
                  className={p.qrHandle}
                  title={t("host.display.dragResize")}
                  aria-label={t("host.display.dragResize")}
                  {...qrDrag}
                />
              )}
            </SectionChrome>
          }
        >
          {/* Inert while customizing: a click selects the section rather than
              firing its controls. */}
          <div
            className={section === "queue" ? p.grow : ""}
            style={{ pointerEvents: "none" }}
          >
            {liveNode[section]}
          </div>
        </Spot>
      </div>
    );
  }

  return (
    <>
      {sectionOrder.map((section) => renderSection(section))}
      {/* Pinned last, never customizable — purely a run-time affordance. */}
      {!remote && reactionsOn && isPlaying && currentSong && (
        <div className={styles.sidebarBottom}>
          <button
            className={`${styles.drawerToggle} ${cheersOpen ? styles.drawerToggleOpen : ""}`}
            onClick={onToggleCheers}
            aria-expanded={cheersOpen}
          >
            <svg className={styles.drawerCaret} width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
              <path d="M0 0l5 6 5-6z" />
            </svg>
            {t("host.cheers")}
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
        </div>
      )}
    </>
  );
}
