import * as React from 'react';
import p from '../../../styles/DisplayDesigner.module.css';
import d from '../../../styles/Display.module.css';
import NowPlayingBar from '../../display/NowPlayingBar';
import AttractPanel from '../../display/AttractPanel';
import { DisplayConfig, QueueEntry, SidebarPosition } from '../../../pages/api/types';
import { useT } from '../../../lib/i18n/I18nProvider';
import { renderWithHeart } from '../../../lib/i18n/renderWithHeart';
import { Spot, HideButton, SectionId, PreviewMode } from './PreviewSpot';
import { PreviewSidebar } from './PreviewSidebar';

export type { SectionId, PreviewMode } from './PreviewSpot';

// The canvas renders the TV at its real design size and scales down to fit,
// so the actual display components (and their CSS) are reused untouched.
const TV_W = 1280;

const PREVIEW_REACTIONS = [
  { emoji: '🔥', left: 18, sway: -30, delay: 0 },
  { emoji: '👏', left: 48, sway: 24, delay: 1.6 },
  { emoji: '💜', left: 72, sway: -12, delay: 3.1 },
];

interface DisplayPreviewProps {
  config: DisplayConfig;
  mode: PreviewMode;
  selected: SectionId | null;
  onSelect: (section: SectionId | null) => void;
  onChange: (patch: Partial<DisplayConfig>) => void;
  joinUrl: string;
  joinCode: string;
  origin: string;
  upNext: QueueEntry[];
  currentSinger: string;
  currentSong: string;
  queue: QueueEntry[];
  activeIndex: number;
}

const DisplayPreview = ({
  config,
  mode,
  selected,
  onSelect,
  onChange,
  joinUrl,
  joinCode,
  origin,
  upNext,
  currentSinger,
  currentSong,
  queue,
  activeIndex,
}: DisplayPreviewProps): React.ReactElement => {
  const { t } = useT();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.4);
  // In-flight drag values, rendered live but only written to the room when the
  // drag ends — a width drag must not POST once per pixel.
  const [draft, setDraft] = React.useState<Partial<DisplayConfig> | null>(null);
  // Where the sidebar would land if the side-flip drag ended now.
  const [dragTarget, setDragTarget] = React.useState<SidebarPosition | null>(null);

  const view = draft ? { ...config, ...draft } : config;

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / TV_W);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  function applyDraft(patch: Partial<DisplayConfig>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function commit(patch: Partial<DisplayConfig>) {
    setDraft(null);
    if (Object.keys(patch).length > 0) onChange(patch);
  }

  const dragHandleProps: React.ComponentProps<'button'> = {
    onPointerDown: (e) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragTarget(view.sidebarPosition);
    },
    onPointerMove: (e) => {
      if (dragTarget === null) return;
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDragTarget(e.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
    },
    onPointerUp: () => {
      if (dragTarget && dragTarget !== view.sidebarPosition) {
        onChange({ sidebarPosition: dragTarget });
      }
      setDragTarget(null);
    },
    onPointerCancel: () => setDragTarget(null),
  };

  const hiddenTap = (section: string) => t('host.display.hiddenTap', { section });

  const themeClass =
    view.theme === 'minimal' ? d.themeMinimal : view.theme === 'neon' ? d.themeNeon : '';
  const left = view.sidebarPosition === 'left';

  return (
    <div className={p.frame} ref={frameRef} onClick={() => onSelect(null)}>
      <main
        className={`${d.main} ${p.canvas} ${themeClass} ${left ? `${d.sidebarLeft} ${p.canvasLeft}` : ''}`}
        style={{ transform: `scale(${scale})`, '--sb-w': `${view.sidebarWidth}px` } as React.CSSProperties}
      >
        <header className={`${d.header} ${p.headerBar}`}>
          <div className={d.brand}>KaraoQ</div>
        </header>

        <div className={`${d.videoArea} ${p.videoBox}`}>
          {mode === 'live' ? (
            <div className={p.fakeVideo}>
              <div className={p.fakePlay}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className={p.fakeVideoLabel}>{t('host.display.previewVideo')}</span>
            </div>
          ) : (
            <Spot
              id="attract"
              selected={selected}
              onSelect={onSelect}
              label={t('host.display.attract')}
              className={p.fill}
            >
              {view.attractMode ? (
                <AttractPanel
                  joinUrl={joinUrl}
                  joinCode={joinCode}
                  origin={origin}
                  welcomeLine={view.welcomeLine}
                  queue={queue}
                  activeIndex={activeIndex}
                />
              ) : (
                <div className={d.centerState}>
                  <h1 className={d.waitingTitle}>KaraoQ</h1>
                  <p className={d.waitingText}>
                    {t('display.waiting').split(/(\{url\}|\{code\})/).map((part, i) => {
                      if (part === '{url}') return <strong key={i}>{(origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '')}</strong>;
                      if (part === '{code}') return <strong key={i}>{joinCode.toUpperCase()}</strong>;
                      return <React.Fragment key={i}>{part}</React.Fragment>;
                    })}
                  </p>
                </div>
              )}
            </Spot>
          )}

          {mode === 'live' && (
            view.showReactions ? (
              <div
                className={`${d.reactionOverlay} ${p.reactSpot} ${p.spot} ${selected === 'reactions' ? p.spotOn : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect('reactions');
                }}
              >
                {PREVIEW_REACTIONS.map((r) => (
                  <div
                    key={r.emoji}
                    className={d.reactionBubble}
                    style={{
                      left: `${r.left}%`,
                      '--sway': `${r.sway}px`,
                      animationIterationCount: 'infinite',
                      animationDelay: `${r.delay}s`,
                    } as React.CSSProperties}
                  >
                    <span className={d.reactionEmoji}>{r.emoji}</span>
                  </div>
                ))}
                <span className={p.spotTag}>{t('host.display.reactions')}</span>
                <div className={p.chrome}>
                  <HideButton title={t('host.display.hide')} onHide={() => commit({ showReactions: false })} />
                </div>
              </div>
            ) : (
              <button
                className={`${p.ghost} ${p.ghostChip}`}
                onClick={(e) => {
                  e.stopPropagation();
                  commit({ showReactions: true });
                  onSelect('reactions');
                }}
              >
                {hiddenTap(t('host.display.reactions'))}
              </button>
            )
          )}
        </div>

        {mode === 'live' && (
          view.showNowPlaying ? (
            <Spot
              id="nowPlaying"
              selected={selected}
              onSelect={onSelect}
              label={t('host.display.nowPlaying')}
              className={p.nowSlot}
              positioned
              chrome={
                <div className={p.chrome}>
                  <HideButton title={t('host.display.hide')} onHide={() => commit({ showNowPlaying: false })} />
                </div>
              }
            >
              <NowPlayingBar singerName={currentSinger} songTitle={currentSong} />
            </Spot>
          ) : (
            <button
              className={`${p.ghost} ${p.ghostStrip}`}
              onClick={(e) => {
                e.stopPropagation();
                commit({ showNowPlaying: true });
                onSelect('nowPlaying');
              }}
            >
              {hiddenTap(t('host.display.nowPlaying'))}
            </button>
          )
        )}

        <div className={`${d.footer} ${p.footerBar}`}>
          <span className={d.footerLogo}>KaraoQ</span>
          <span className={d.footerLink}>{renderWithHeart(t('footer.credit'), d.footerHeart)}</span>
        </div>

        <PreviewSidebar
          view={view}
          selected={selected}
          onSelect={onSelect}
          onDraft={applyDraft}
          onCommit={commit}
          scale={scale}
          joinUrl={joinUrl}
          joinCode={joinCode}
          origin={origin}
          upNext={upNext}
          dragging={dragTarget !== null}
          dragHandleProps={dragHandleProps}
        />
      </main>

      {dragTarget !== null && (
        <>
          <div className={`${p.dropZone} ${p.dropZoneL} ${dragTarget === 'left' ? p.dropZoneActive : ''}`}>
            {t('host.display.side.left')}
          </div>
          <div className={`${p.dropZone} ${p.dropZoneR} ${dragTarget === 'right' ? p.dropZoneActive : ''}`}>
            {t('host.display.side.right')}
          </div>
        </>
      )}
    </div>
  );
};

export default DisplayPreview;
