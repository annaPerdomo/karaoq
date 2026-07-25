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
  banner: "host.display.banner",
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

  // The widest QR the current sidebar can hold: the shelf pads 1rem a side,
  // the thumb frames the code with 6px of inset, and the join info keeps a
  // column beside the code (128px + the row's 0.75rem gap) — the text sits to
  // the QR's right at every size, never squeezed out or dropped underneath.
  // The drag stops there rather than at the global cap — widen the sidebar and
  // the QR can follow — and rendering clamps too, covering configs saved when
  // the sidebar was wider.
  const qrPxFit = Math.max(
    QR_PX_MIN,
    Math.min(QR_PX_MAX, config.sidebarWidth - 44 - 12 - 128)
  );
  const qrPxShown = Math.min(config.qrPx, qrPxFit);

  // The grip rides the code's bottom-right corner, so the drag is diagonal:
  // pull outward (down-right) to enlarge — same interaction as the display's.
  const qrDrag = useScalarDrag({
    value: qrPxShown,
    min: QR_PX_MIN,
    max: qrPxFit,
    onChange: (qrPx) => edit?.onChange({ qrPx }),
  });

  // The banner's corner grip scales its TYPE — 2px of drag per font px keeps
  // the swing controllable across the whole range.
  const bannerDrag = useScalarDrag({
    value: config.bannerPx,
    min: BANNER_PX_MIN,
    max: BANNER_PX_MAX,
    scale: 2,
    onChange: (bannerPx) => edit?.onChange({ bannerPx }),
  });

  // Which sections have the underlying data to appear at all.
  const dataReady: Record<HostSection, boolean> = {
    queue: true,
    boards: !!joinCode,
    qr: !remote && !!joinUrl,
    banner: !remote,
  };

  // An empty roll-up renders nothing, so before guests post the section was a
  // zero-height strip — invisible live, and in Customize mode a floating
  // grip/eye cluster overlapping whatever sat below it. Same content test the
  // display's sidebar uses: full sing-together posts have nothing left to
  // recruit for.
  const openPosts = boards.singWithMe.filter(
    (p) => p.joinedSingers.length < p.maxSingers
  );
  const boardsHasContent = openPosts.length + boards.suggestions.length > 0;

  // The queue can be moved but never hidden — without it there's no host page.
  // The announcement banner shows by having text, like the display's.
  const shown: Record<HostSection, boolean> = {
    queue: true,
    boards: config.showBoards,
    qr: config.showQr,
    banner: config.bannerLine !== "",
  };

  const visible: Record<HostSection, boolean> = {
    queue: dataReady.queue && shown.queue,
    // Live, an empty boards section hides outright; in Customize mode it stays
    // arrangeable via a labelled placeholder.
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
      {/* While customizing the shelf always renders — a tucked-away QR can't be
          resized, and its drawer toggle is inert in edit mode. */}
      {(qrShelfOpen || !!edit) && (
        <div
          className={styles.qrShelf}
          // The shelf's text tracks the code's dragged size — but only gently,
          // capped well below the code's own growth: the text lives in the
          // column beside the QR, and the code is what must stay readable.
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
              // The thumb grows with the code (+12 keeps its 6px inset), otherwise
              // the fixed 80px frame would crop anything the host drags larger.
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

  // The banner lives or dies by its text, so its eye clears the line and its
  // ghost just selects the rail card — typing brings it back.
  const hidePatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: false },
    qr: { showQr: false },
    banner: { bannerLine: "" },
  };
  const showPatch: Record<HostSection, Partial<HostConfig>> = {
    queue: {},
    boards: { showBoards: true },
    qr: { showQr: true },
    banner: {},
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
          {/* Inert while customizing: a click selects the section rather than
              firing its controls. */}
          <div
            className={section === "queue" ? p.grow : ""}
            style={{ pointerEvents: "none" }}
          >
            {section === "boards" && !boardsHasContent ? (
              // Stand-in body while the boards are empty, so the section can
              // still be arranged before any guest has posted.
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
