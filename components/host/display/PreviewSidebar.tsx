import * as React from 'react';
import p from '../../../styles/DisplayDesigner.module.css';
import d from '../../../styles/Display.module.css';
import QrJoinCard from '../../QrJoinCard';
import UpNextList from '../../display/UpNextList';
import { DisplayConfig, QueueEntry, SidebarSection, nearestQrSize } from '../../../pages/api/types';
import {
  QR_PX_MIN,
  QR_PX_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  UP_NEXT_COUNT_MAX,
} from '../../../lib/limits';
import { useT } from '../../../lib/i18n/I18nProvider';
import { Spot, HideButton, SectionId } from './PreviewSpot';
import { useCanvasDrag } from './hooks/useCanvasDrag';

// Approximate rendered height of one up-next row; the depth drag converts
// pointer travel to "rows worth" of songs. Off-by-a-few just changes drag feel.
const UP_NEXT_ROW_H = 54;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface PreviewSidebarProps {
  /** Config merged with any in-flight drag draft. */
  view: DisplayConfig;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  /** Live-preview a change during a drag (no server write). */
  onDraft: (patch: Partial<DisplayConfig>) => void;
  /** Commit a change (writes to the room; a drag's final value). */
  onCommit: (patch: Partial<DisplayConfig>) => void;
  scale: number;
  joinUrl: string;
  joinCode: string;
  origin: string;
  upNext: QueueEntry[];
  dragging: boolean;
  dragHandleProps: React.ComponentProps<'button'>;
}

/** The preview's QR/welcome/up-next rail: drag to reorder sections, resize the
 * QR and up-next depth, set the sidebar width; ghosts restore hidden sections. */
export function PreviewSidebar({
  view,
  selected,
  onSelect,
  onDraft,
  onCommit,
  scale,
  joinUrl,
  joinCode,
  origin,
  upNext,
  dragging,
  dragHandleProps,
}: PreviewSidebarProps) {
  const { t } = useT();
  const [lifted, setLifted] = React.useState<SidebarSection | null>(null);
  const sectionEls = React.useRef<Partial<Record<SidebarSection, HTMLDivElement | null>>>({});
  // The latest value of the in-flight drag, committed on release.
  const pending = React.useRef<Partial<DisplayConfig>>({});
  const base = React.useRef(0);

  function startDrag() {
    pending.current = {};
  }

  function endDrag() {
    setLifted(null);
    onCommit(pending.current);
  }

  function draft(patch: Partial<DisplayConfig>) {
    pending.current = { ...pending.current, ...patch };
    onDraft(patch);
  }

  const widthDrag = useCanvasDrag(scale, {
    onStart: () => {
      startDrag();
      base.current = view.sidebarWidth;
    },
    onMove: (dx) => {
      const grow = view.sidebarPosition === 'right' ? -dx : dx;
      draft({ sidebarWidth: clamp(Math.round(base.current + grow), SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX) });
    },
    onEnd: endDrag,
  });

  const qrDrag = useCanvasDrag(scale, {
    onStart: () => {
      startDrag();
      base.current = view.qrPx;
    },
    onMove: (dx, dy) => {
      const px = clamp(Math.round(base.current + (dx + dy) / 2), QR_PX_MIN, QR_PX_MAX);
      draft({ qrPx: px, qrSize: nearestQrSize(px) });
    },
    onEnd: endDrag,
  });

  const countDrag = useCanvasDrag(scale, {
    onStart: () => {
      startDrag();
      base.current = view.upNextCount;
    },
    onMove: (_dx, dy) => {
      draft({ upNextCount: clamp(base.current + Math.round(dy / UP_NEXT_ROW_H), 1, UP_NEXT_COUNT_MAX) });
    },
    onEnd: endDrag,
  });

  const visible: Record<SidebarSection, boolean> = {
    qr: view.qrSize !== 'hidden',
    welcome: view.welcomeLine !== '',
    upNext: view.showUpNext,
  };

  const liftedRef = React.useRef<SidebarSection | null>(null);
  const reorderDrag = useCanvasDrag(scale, {
    onStart: startDrag,
    onMove: (_dx, _dy, e) => {
      const id = liftedRef.current;
      if (!id) return;
      // Slot = how many other visible sections' midpoints the pointer is below.
      const others = view.sidebarOrder.filter((s) => s !== id && visible[s]);
      const above = others.filter((s) => {
        const rect = sectionEls.current[s]?.getBoundingClientRect();
        return rect && e.clientY > rect.top + rect.height / 2;
      });
      const next: SidebarSection[] = [
        ...above,
        id,
        ...others.filter((s) => !above.includes(s)),
        ...view.sidebarOrder.filter((s) => !visible[s]),
      ];
      if (next.join() !== view.sidebarOrder.join()) draft({ sidebarOrder: next });
    },
    onEnd: () => {
      liftedRef.current = null;
      endDrag();
    },
  });

  const gripProps = (id: SidebarSection): React.ComponentProps<'button'> => ({
    ...reorderDrag,
    onPointerDown: (e) => {
      liftedRef.current = id;
      setLifted(id);
      reorderDrag.onPointerDown(e);
    },
  });

  function chromeFor(id: SidebarSection, onHide?: () => void) {
    return (
      <div className={p.chrome}>
        <button
          className={`${p.chromeBtn} ${p.gripBtn}`}
          title={t('host.display.dragReorder')}
          aria-label={t('host.display.dragReorder')}
          {...gripProps(id)}
        >
          ⋮⋮
        </button>
        {onHide && <HideButton title={t('host.display.hide')} onHide={onHide} />}
      </div>
    );
  }

  const hiddenTap = (section: string) => t('host.display.hiddenTap', { section });

  const ghost = (id: SectionId, label: string, restore: () => void) => (
    <button
      key={id}
      className={p.ghost}
      onClick={(e) => {
        e.stopPropagation();
        restore();
        onSelect(id);
      }}
    >
      {label}
    </button>
  );

  const sections: Record<SidebarSection, React.ReactNode> = {
    qr: visible.qr ? (
      <div key="qr" ref={(el) => { sectionEls.current.qr = el; }} className={lifted === 'qr' ? p.sectionLifted : ''}>
        <Spot
          id="qr"
          selected={selected}
          onSelect={onSelect}
          label={t('host.display.qr')}
          chrome={
            <>
              {chromeFor('qr', () => onCommit({ qrSize: 'hidden' }))}
              <button
                className={p.qrHandle}
                title={t('host.display.dragResize')}
                aria-label={t('host.display.dragResize')}
                {...qrDrag}
              />
            </>
          }
        >
          <QrJoinCard
            joinUrl={joinUrl}
            joinCode={joinCode}
            origin={origin}
            size={nearestQrSize(view.qrPx)}
            sizePx={view.qrPx}
          />
        </Spot>
      </div>
    ) : (
      ghost('qr', hiddenTap(t('host.display.qr')), () =>
        onCommit({ qrSize: nearestQrSize(view.qrPx) })
      )
    ),
    welcome: visible.welcome ? (
      <div key="welcome" ref={(el) => { sectionEls.current.welcome = el; }} className={lifted === 'welcome' ? p.sectionLifted : ''}>
        <Spot
          id="welcome"
          selected={selected}
          onSelect={onSelect}
          label={t('host.display.welcome')}
          chrome={chromeFor('welcome')}
        >
          <p className={d.welcomeLine}>{view.welcomeLine}</p>
        </Spot>
      </div>
    ) : (
      ghost('welcome', `+ ${t('host.display.addWelcome')}`, () => {})
    ),
    upNext: visible.upNext ? (
      <div key="upNext" ref={(el) => { sectionEls.current.upNext = el; }} className={`${p.grow} ${lifted === 'upNext' ? p.sectionLifted : ''}`}>
        <Spot
          id="upNext"
          selected={selected}
          onSelect={onSelect}
          label={t('host.display.upNext')}
          className={p.grow}
          chrome={
            <>
              {chromeFor('upNext', () => onCommit({ showUpNext: false }))}
              <button
                className={p.countHandle}
                title={t('host.display.dragCount')}
                aria-label={t('host.display.dragCount')}
                {...countDrag}
              >
                ↕ {view.upNextCount}
              </button>
            </>
          }
        >
          <UpNextList upNext={upNext} upNextCount={view.upNextCount} />
        </Spot>
      </div>
    ) : (
      ghost('upNext', hiddenTap(t('host.display.upNext')), () => onCommit({ showUpNext: true }))
    ),
  };

  return (
    <aside className={`${d.sidebar} ${p.sidebarBox} ${dragging ? p.sidebarDragging : ''}`}>
      <button className={p.dragHandle} {...dragHandleProps}>
        ⋮⋮ {t('host.display.dragHint')}
      </button>

      {view.sidebarOrder.map((id) => sections[id])}

      <button
        className={`${p.widthHandle} ${view.sidebarPosition === 'right' ? p.widthHandleL : p.widthHandleR}`}
        title={t('host.display.dragWidth')}
        aria-label={t('host.display.dragWidth')}
        {...widthDrag}
      />
    </aside>
  );
}
