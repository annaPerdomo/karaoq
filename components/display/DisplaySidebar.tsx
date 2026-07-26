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
  BANNER_PX_MIN,
  BANNER_PX_MAX,
  QR_PX_MIN,
  QR_PX_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  UP_NEXT_COUNT_MAX,
} from '../../lib/limits';
import { useT } from '../../lib/i18n/I18nProvider';
import { Spot, SectionId } from './edit/EditChrome';
import { CornerHandle } from '../edit/EditChrome';
import { SectionChrome, SectionGhost } from '../edit/SectionChrome';
import { useSectionReorder } from '../edit/hooks/useSectionReorder';
import { useScalarDrag } from '../edit/hooks/useScalarDrag';

// Approximate rendered height of one up-next row; the depth drag converts
// pointer travel to rows.
const UP_NEXT_ROW_H = 54;

export interface SidebarEdit {
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
  /** boardsOn is a room field outside DisplayConfig, so it rides separately from onChange. */
  onToggleBoards: () => void;
  dragging: boolean;
  dragHandleProps: React.ComponentProps<'button'>;
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
  const { qrSize, qrPx, showUpNext, upNextCount, bannerLine, bannerPx, sidebarOrder } = view;

  const change = (patch: Partial<DisplayConfig>) => edit?.onChange(patch);

  // Widest QR the sidebar can hold: 40px card padding + 16px row gap + 96px label
  // column. Rendering clamps too, covering configs saved when the sidebar was wider.
  const qrPxFit = Math.max(QR_PX_MIN, Math.min(QR_PX_MAX, view.sidebarWidth - 40 - 16 - 96));
  const qrPxShown = Math.min(qrPx, qrPxFit);

  const qrDrag = useScalarDrag({
    value: qrPxShown,
    min: QR_PX_MIN,
    max: qrPxFit,
    // qrSize rides along so displays predating fine-grained sizing approximate it.
    onChange: (px) => change({ qrPx: px, qrSize: nearestQrSize(px) }),
  });

  // scale 2: 2px of drag per font px keeps the swing controllable.
  const bannerDrag = useScalarDrag({
    value: bannerPx,
    min: BANNER_PX_MIN,
    max: BANNER_PX_MAX,
    scale: 2,
    onChange: (px) => change({ bannerPx: px }),
  });

  const countDrag = useScalarDrag({
    value: view.upNextCount,
    min: 1,
    max: UP_NEXT_COUNT_MAX,
    axis: 'y',
    scale: UP_NEXT_ROW_H,
    onChange: (upNextCount) => change({ upNextCount }),
  });

  const openPosts = singWithMe.filter((p) => p.joinedSingers.length < p.maxSingers);
  const boardsHasContent = openPosts.length + suggestions.length > 0;

  const visible: Record<SidebarSection, boolean> = {
    qr: qrSize !== 'hidden',
    banner: bannerLine !== '',
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

  const liveSections: Record<SidebarSection, React.ReactNode> = {
    qr: visible.qr && (
      <QrJoinCard
        key="qr"
        joinUrl={joinUrl}
        joinCode={joinCode}
        origin={origin}
        size={nearestQrSize(qrPx)}
        sizePx={qrPxShown}
        resizeHandle={
          edit && (
            <CornerHandle title={t('host.display.dragResize')} dragProps={qrDrag} />
          )
        }
      />
    ),
    banner: visible.banner && (
      <p key="banner" className={styles.bannerLine} style={{ fontSize: bannerPx }}>
        {bannerLine}
      </p>
    ),
    upNext: visible.upNext && (
      <UpNextList key="upNext" upNext={upNext} upNextCount={upNextCount} />
    ),
    boards: visible.boards && <React.Fragment key="boards">{boardsSummary}</React.Fragment>,
  };

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
              chrome={chromeFor('qr', () => change({ qrSize: 'hidden' }))}
            >
              {liveSections.qr}
            </Spot>
          </div>
        ) : (
          ghost('qr', hiddenTap(t('host.display.qr')), () =>
            change({ qrSize: nearestQrSize(qrPx) })
          )
        ),
        banner: visible.banner ? (
          <div
            key="banner"
            ref={sectionRef('banner')}
            className={lifted === 'banner' ? p.sectionLifted : ''}
          >
            <Spot
              id="banner"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('host.display.banner')}
              chrome={
                <>
                  {chromeFor('banner')}
                  <CornerHandle
                    title={t('host.display.dragResize')}
                    dragProps={bannerDrag}
                    className={p.cornerOnEdge}
                  />
                </>
              }
            >
              {liveSections.banner}
            </Spot>
          </div>
        ) : (
          // Restore is a no-op: selecting focuses the rail's banner input; typing shows the section.
          ghost('banner', `+ ${t('host.display.addBanner')}`, () => {})
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
