import * as React from 'react';
import styles from '../../styles/Display.module.css';
import p from '../../styles/DisplayDesigner.module.css';
import QrJoinCard from '../QrJoinCard';
import BoardsSummary from '../boards/BoardsSummary';
import UpNextList from './UpNextList';
import { QueueEstimate } from '../../lib/queueTime';
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
} from '../../lib/limits';
import { useT } from '../../lib/i18n/I18nProvider';
import { CornerHandle, Spot } from '../edit/EditChrome';
import { DisplaySectionId } from './edit/useDisplayEdit';
import { SectionChrome, SectionGhost } from '../edit/SectionChrome';
import { useSectionReorder } from '../edit/hooks/useSectionReorder';
import { useScalarDrag } from '../edit/hooks/useScalarDrag';

export interface SidebarEdit {
  selected: DisplaySectionId | null;
  onSelect: (section: DisplaySectionId | null) => void;
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
  /** Absent while customizing, where the list shows sample content. */
  estimate?: QueueEstimate;
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
  estimate,
  boardsOn,
  singWithMe,
  suggestions,
  displayConfig,
  edit,
}: DisplaySidebarProps): React.ReactElement => {
  const { t } = useT();
  const view = displayConfig;
  const { qrSize, qrPx, showUpNext, bannerLine, bannerPx, sidebarOrder } = view;

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

  const hiddenTap = (section: string) => t('customize.hiddenTap', { section });

  const ghost = (id: DisplaySectionId, label: string, restore: () => void) => (
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
            <CornerHandle title={t('customize.dragResize')} dragProps={qrDrag} />
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
      <UpNextList key="upNext" upNext={upNext} estimate={estimate} />
    ),
    boards: visible.boards && (
      <div key="boards" className={p.shrinkBlock}>
        {boardsSummary}
      </div>
    ),
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
              label={t('customize.qr')}
              chrome={chromeFor('qr', () => change({ qrSize: 'hidden' }))}
            >
              {liveSections.qr}
            </Spot>
          </div>
        ) : (
          ghost('qr', hiddenTap(t('customize.qr')), () =>
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
              label={t('customize.banner')}
              chrome={
                <>
                  {chromeFor('banner')}
                  <CornerHandle
                    title={t('customize.dragResize')}
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
          ghost('banner', `+ ${t('customize.addBanner')}`, () => {})
        ),
        upNext: visible.upNext ? (
          <div
            key="upNext"
            ref={sectionRef('upNext')}
            className={`${p.growBlock} ${lifted === 'upNext' ? p.sectionLifted : ''}`}
          >
            <Spot
              id="upNext"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('customize.queue')}
              className={p.grow}
              chrome={chromeFor('upNext', () => change({ showUpNext: false }))}
            >
              {liveSections.upNext}
            </Spot>
          </div>
        ) : (
          ghost('upNext', hiddenTap(t('customize.queue')), () => change({ showUpNext: true }))
        ),
        boards: visible.boards ? (
          <div
            key="boards"
            ref={sectionRef('boards')}
            className={`${p.shrinkBlock} ${lifted === 'boards' ? p.sectionLifted : ''}`}
          >
            <Spot
              id="boards"
              selected={edit.selected}
              onSelect={edit.onSelect}
              label={t('customize.boards')}
              chrome={chromeFor('boards', edit.onToggleBoards)}
            >
              {boardsHasContent ? (
                boardsSummary
              ) : (
                <div className={p.boardsPlaceholder}>{t('customize.boardsEmpty')}</div>
              )}
            </Spot>
          </div>
        ) : (
          ghost('boards', hiddenTap(t('customize.boards')), edit.onToggleBoards)
        ),
      }
    : liveSections;

  return (
    <div className={`${styles.sidebar} ${edit?.dragging ? p.sidebarDragging : ''}`}>
      {edit && (
        <button className={p.dragHandle} {...edit.dragHandleProps}>
          ⋮⋮ {t('customize.dragHint')}
        </button>
      )}

      {sidebarOrder.map((section) => editSections[section])}

      {edit && (
        <button
          className={`${p.widthHandle} ${view.sidebarPosition === 'right' ? p.widthHandleL : p.widthHandleR}`}
          title={t('customize.dragWidth')}
          aria-label={t('customize.dragWidth')}
          {...edit.widthDragProps}
        />
      )}
    </div>
  );
};

export default DisplaySidebar;
