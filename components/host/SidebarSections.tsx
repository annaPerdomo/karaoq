import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import styles from "../../styles/Host.module.css";
import p from "../../styles/DisplayDesigner.module.css";
import CheerBar from "../CheerBar";
import BoardsSummary from "../boards/BoardsSummary";
import { DEFAULT_HOST_CONFIG, HostConfig, HostSection, QueueEntry } from "../../pages/api/types";
import { BANNER_PX_MIN, BANNER_PX_MAX, QR_PX_MIN, QR_PX_MAX } from "../../lib/limits";
import { Boards } from "../../app/queue/useBoards";
import { useT } from "../../lib/i18n/I18nProvider";
import { CornerHandle, Spot } from "../edit/EditChrome";
import { SectionChrome, SectionGhost } from "../edit/SectionChrome";
import { useSectionReorder } from "../edit/hooks/useSectionReorder";
import { useScalarDrag } from "../edit/hooks/useScalarDrag";
import { HostSectionId } from "./edit/useHostEdit";

export interface HostSidebarEdit {
  selected: HostSectionId | null;
  onSelect: (section: HostSectionId | null) => void;
  onChange: (patch: Partial<HostConfig>) => void;
}

interface SidebarSectionsProps {
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
  /** Draft while editing, server-synced otherwise. */
  config: HostConfig;
  edit?: HostSidebarEdit;
}

const SECTION_LABEL: Record<HostSection, string> = {
  queue: "host.customize.queue",
  boards: "host.customize.boards",
  qr: "host.customize.qr",
  banner: "host.display.banner",
};

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

  // Widest QR the sidebar holds (44 shelf padding + 12 thumb inset + 128 info column).
  // Rendering clamps too: a config may have been saved when the sidebar was wider.
  const qrPxFit = Math.max(
    QR_PX_MIN,
    Math.min(QR_PX_MAX, config.sidebarWidth - 44 - 12 - 128)
  );
  const qrPxShown = Math.min(config.qrPx, qrPxFit);

  const qrDrag = useScalarDrag({
    value: qrPxShown,
    min: QR_PX_MIN,
    max: qrPxFit,
    onChange: (qrPx) => edit?.onChange({ qrPx }),
  });

  const bannerDrag = useScalarDrag({
    value: config.bannerPx,
    min: BANNER_PX_MIN,
    max: BANNER_PX_MAX,
    scale: 2,
    onChange: (bannerPx) => edit?.onChange({ bannerPx }),
  });

  const dataReady: Record<HostSection, boolean> = {
    queue: true,
    boards: !!joinCode,
    qr: !remote && !!joinUrl,
    banner: !remote,
  };

  // An empty roll-up renders as a zero-height strip — invisible live, and in
  // Customize mode a floating grip/eye cluster over whatever sits below it.
  const openPosts = boards.singWithMe.filter(
    (p) => p.joinedSingers.length < p.maxSingers
  );
  const boardsHasContent = openPosts.length + boards.suggestions.length > 0;

  const shown: Record<HostSection, boolean> = {
    queue: true,
    boards: config.showBoards,
    qr: config.showQr,
    banner: config.bannerLine !== "",
  };

  const visible: Record<HostSection, boolean> = {
    queue: dataReady.queue && shown.queue,
    boards: dataReady.boards && shown.boards && (boardsHasContent || !!edit),
    qr: dataReady.qr && shown.qr,
    banner: dataReady.banner && shown.banner,
  };

  const { lifted, gripProps, sectionRef } = useSectionReorder<HostSection>({
    order: sectionOrder,
    visible,
    onReorder: (sectionOrder) => edit?.onChange({ sectionOrder }),
  });

  const ghost = (id: HostSection, restore: () => void) => (
    <SectionGhost
      key={id}
      label={
        id === "banner"
          ? `+ ${t("host.display.addBanner")}`
          : t("host.display.hiddenTap", { section: t(SECTION_LABEL[id]) })
      }
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
      {/* While customizing the shelf always renders — a tucked-away QR can't be resized. */}
      {(qrShelfOpen || !!edit) && (
        <div
          className={styles.qrShelf}
          style={
            {
              "--qr-scale": Math.min(
                1.4,
                1 + (qrPxShown / DEFAULT_HOST_CONFIG.qrPx - 1) * 0.2
              ),
            } as React.CSSProperties
          }
        >
          <span className={p.cornerAnchor}>
            <button
              className={styles.qrShelfThumb}
              // +12 keeps the thumb's 6px inset around the code at any size.
              style={{ width: qrPxShown + 12, height: qrPxShown + 12 }}
              onClick={onOpenQrModal}
              title={t("host.qr.enlarge")}
              aria-label={t("host.qr.enlarge")}
            >
              <QRCodeSVG
                value={joinUrl}
                size={qrPxShown}
                bgColor="transparent"
                fgColor="#ffffff"
                level="M"
              />
            </button>
            {!!edit && (
              <CornerHandle title={t("host.display.dragResize")} dragProps={qrDrag} />
            )}
          </span>
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
    banner: (
      <p className={styles.bannerLine} style={{ fontSize: config.bannerPx }}>
        {config.bannerLine}
      </p>
    ),
  };

  const hidePatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: false },
    qr: { showQr: false },
    banner: {},
  };
  const showPatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: true },
    qr: { showQr: true },
    banner: {},
  };

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
              // No eye for the queue (never hideable) or the banner (hiding it would erase its text).
              onHide={
                section === "queue" || section === "banner"
                  ? undefined
                  : () => edit.onChange(hidePatch[section])
              }
            >
              {section === "banner" && (
                <CornerHandle
                  title={t("host.display.dragResize")}
                  dragProps={bannerDrag}
                  className={p.cornerOnEdge}
                />
              )}
            </SectionChrome>
          }
        >
          <div
            className={section === "queue" ? p.grow : ""}
            style={{ pointerEvents: "none" }}
          >
            {section === "boards" && !boardsHasContent ? (
              <div className={p.boardsPlaceholder}>
                {t("host.display.boardsEmpty")}
              </div>
            ) : (
              liveNode[section]
            )}
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
