import * as React from 'react';
import styles from '../../styles/Display.module.css';
import p from '../../styles/DisplayDesigner.module.css';
import QrJoinCard from '../QrJoinCard';
import BoardsSummary from '../boards/BoardsSummary';
import UpNextList from './UpNextList';
import {
  DisplayConfig,
  QueueEntry,
  SidebarSection,
  SingWithMePost,
  SuggestedSong,
  nearestQrSize,
} from '../../pages/api/types';
import {
  QR_PX_MIN,
  QR_PX_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  UP_NEXT_COUNT_MAX,
} from '../../lib/limits';
import { useT } from '../../lib/i18n/I18nProvider';
import { Spot, SectionId } from './edit/EditChrome';
import { SectionChrome, SectionGhost } from '../edit/SectionChrome';
import { useSectionReorder } from '../edit/hooks/useSectionReorder';
import { useScalarDrag } from '../edit/hooks/useScalarDrag';

// Approximate rendered height of one up-next row; the depth drag converts
// pointer travel to "rows worth" of songs. Off-by-a-few just changes drag feel.
const UP_NEXT_ROW_H = 54;

/** Present only in edit mode — the same sidebar then grows drag handles,
 * outlines, and ghosts on its real sections. */
export interface SidebarEdit {
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
  /** boardsOn is a room field outside DisplayConfig, so its hide/show rides
   * separately from onChange. */
  onToggleBoards: () => void;
  /** True while the whole sidebar is being dragged across the screen. */
  dragging: boolean;
  /** "Switch sides" drag on the sidebar's top handle. */
  dragHandleProps: React.ComponentProps<'button'>;
  /** Resize drag on the sidebar's inner edge. */
  widthDragProps: React.ComponentProps<'button'>;
}

interface DisplaySidebarProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  upNext: QueueEntry[];
  boardsOn: boolean;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  displayConfig: DisplayConfig;
  edit?: SidebarEdit;
}

/** The QR/welcome/up-next sections the sidebar always shows. In edit mode the
 * REAL sections become the editing surface: drag to reorder, resize the QR and
 * up-next depth, set the width; ghosts restore hidden sections. */
const DisplaySidebar = ({
  joinUrl,
  joinCode,
  origin,
  upNext,
  boardsOn,
  singWithMe,
  suggestions,
  displayConfig,
  edit,
}: DisplaySidebarProps): React.ReactElement => {
  const { t } = useT();
  const view = displayConfig;
  const { qrSize, qrPx, showUpNext, upNextCount, welcomeLine, sidebarOrder } = view;

  // With draft-staged editing every patch is local state, so drag moves and
  // drag ends both flow through the same onChange.
  const change = (patch: Partial<DisplayConfig>) => edit?.onChange(patch);

  const qrDrag = useScalarDrag({
    value: view.qrPx,
    min: QR_PX_MIN,
    max: QR_PX_MAX,
    // qrSize rides along so displays predating fine-grained sizing approximate it.
    onChange: (px) => change({ qrPx: px, qrSize: nearestQrSize(px) }),
  });

  const countDrag = useScalarDrag({
    value: view.upNextCount,
    min: 1,
    max: UP_NEXT_COUNT_MAX,
    axis: 'y',
    scale: UP_NEXT_ROW_H,
    onChange: (upNextCount) => change({ upNextCount }),
  });

  // Boards visibility is the room's boardsOn flag; in edit mode it reflects the
  // draft. Its content is empty until guests post, so edit mode shows a labelled
  // placeholder so the section can still be arranged.
  const openPosts = singWithMe.filter((p) => p.joinedSingers.length < p.maxSingers);
  const boardsHasContent = openPosts.length + suggestions.length > 0;

  const visible: Record<SidebarSection, boolean> = {
    qr: qrSize !== 'hidden',
    welcome: welcomeLine !== '',
    upNext: showUpNext,
    boards: boardsOn,
  };

  const { lifted, gripProps, sectionRef } = useSectionReorder<SidebarSection>({
    order: sidebarOrder,
    visible,
    onReorder: (sidebarOrder) => change({ sidebarOrder }),
  });

  const chromeFor = (id: SidebarSection, onHide?: () => void) => (
    <SectionChrome gripProps={gripProps(id)} onHide={onHide} />
  );

  const hiddenTap = (section: string) => t('host.display.hiddenTap', { section });

  const ghost = (id: SectionId, label: string, restore: () => void) => (
    <SectionGhost
      key={id}
      label={label}
      onRestore={() => {
        restore();
        edit?.onSelect(id);
      }}
    />
  );

  const boardsSummary = (
    <BoardsSummary
      singWithMe={singWithMe}
      suggestions={suggestions}
      cta={t('display.boards.cta')}
    />
  );

  // The plain sections the audience sees; hidden ones simply render nothing.
  const liveSections: Record<SidebarSection, React.ReactNode> = {
    qr: visible.qr && (
      <QrJoinCard
        key="qr"
        joinUrl={joinUrl}
        joinCode={joinCode}
        origin={origin}
        size={nearestQrSize(qrPx)}
        sizePx={qrPx}
      />
    ),
    welcome: visible.welcome && (
      <p key="welcome" className={styles.welcomeLine}>{welcomeLine}</p>
    ),
    upNext: visible.upNext && (
      <UpNextList key="upNext" upNext={upNext} upNextCount={upNextCount} />
    ),
    boards: visible.boards && <React.Fragment key="boards">{boardsSummary}</React.Fragment>,
  };

  // The same sections with editing chrome attached; ghosts stand in for
  // hidden ones so they can be tapped back.
  const editSections: Record<SidebarSection, React.ReactNode> = edit
    ? {
        qr: visible.qr ? (
          <div
            key="qr"
            ref={sectionRef('qr')}
            className={lifted === 'qr' ? p.sectionLifted : ''}
          >
            <Spot
              id="qr"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('host.display.qr')}
              chrome={
                <>
                  {chromeFor('qr', () => change({ qrSize: 'hidden' }))}
                  <button
                    className={p.qrHandle}
                    title={t('host.display.dragResize')}
                    aria-label={t('host.display.dragResize')}
                    {...qrDrag}
                  />
                </>
              }
            >
              {liveSections.qr}
            </Spot>
          </div>
        ) : (
          ghost('qr', hiddenTap(t('host.display.qr')), () =>
            change({ qrSize: nearestQrSize(qrPx) })
          )
        ),
        welcome: visible.welcome ? (
          <div
            key="welcome"
            ref={sectionRef('welcome')}
            className={lifted === 'welcome' ? p.sectionLifted : ''}
          >
            <Spot
              id="welcome"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('host.display.welcome')}
              chrome={chromeFor('welcome')}
            >
              {liveSections.welcome}
            </Spot>
          </div>
        ) : (
          ghost('welcome', `+ ${t('host.display.addWelcome')}`, () => {})
        ),
        upNext: visible.upNext ? (
          <div
            key="upNext"
            ref={sectionRef('upNext')}
            className={`${p.grow} ${lifted === 'upNext' ? p.sectionLifted : ''}`}
          >
            <Spot
              id="upNext"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('host.display.upNext')}
              className={p.grow}
              chrome={
                <>
                  {chromeFor('upNext', () => change({ showUpNext: false }))}
                  <button
                    className={p.countHandle}
                    title={t('host.display.dragCount')}
                    aria-label={t('host.display.dragCount')}
                    {...countDrag}
                  >
                    ↕ {upNextCount}
                  </button>
                </>
              }
            >
              {liveSections.upNext}
            </Spot>
          </div>
        ) : (
          ghost('upNext', hiddenTap(t('host.display.upNext')), () => change({ showUpNext: true }))
        ),
        boards: visible.boards ? (
          <div
            key="boards"
            ref={sectionRef('boards')}
            className={lifted === 'boards' ? p.sectionLifted : ''}
          >
            <Spot
              id="boards"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('host.display.boards')}
              chrome={chromeFor('boards', edit.onToggleBoards)}
            >
              {boardsHasContent ? (
                boardsSummary
              ) : (
                <div className={p.boardsPlaceholder}>{t('host.display.boardsEmpty')}</div>
              )}
            </Spot>
          </div>
        ) : (
          ghost('boards', hiddenTap(t('host.display.boards')), edit.onToggleBoards)
        ),
      }
    : liveSections;

  return (
    <div className={`${styles.sidebar} ${edit?.dragging ? p.sidebarDragging : ''}`}>
      {edit && (
        <button className={p.dragHandle} {...edit.dragHandleProps}>
          ⋮⋮ {t('host.display.dragHint')}
        </button>
      )}

      {sidebarOrder.map((section) => editSections[section])}

      {edit && (
        <button
          className={`${p.widthHandle} ${view.sidebarPosition === 'right' ? p.widthHandleL : p.widthHandleR}`}
          title={t('host.display.dragWidth')}
          aria-label={t('host.display.dragWidth')}
          {...edit.widthDragProps}
        />
      )}
    </div>
  );
};

export default DisplaySidebar;
