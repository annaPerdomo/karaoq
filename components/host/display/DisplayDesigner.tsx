import * as React from 'react';
import p from '../../../styles/DisplayDesigner.module.css';
import styles from '../../../styles/Host.module.css';
import { useT } from '../../../lib/i18n/I18nProvider';
import { DisplayConfig, QueueEntry } from '../../../pages/api/types';
import DisplayPreview, { PreviewMode, SectionId } from './DisplayPreview';
import { DesignerRail } from './DesignerRail';

// Stand-in queue so size/depth controls have something visible to resize even
// while the real queue is short. Names/titles are content, not UI — untranslated.
const SAMPLE_QUEUE: QueueEntry[] = [
  ['Mia', 'Dancing Queen - ABBA'],
  ['Leo', "Livin' on a Prayer - Bon Jovi"],
  ['Priya', 'Bohemian Rhapsody - Queen'],
  ['Sam', 'Sweet Caroline - Neil Diamond'],
  ['Noa', 'Shallow - Lady Gaga & Bradley Cooper'],
  ['Kenji', 'Take On Me - a-ha'],
  ['Rosa', 'I Will Survive - Gloria Gaynor'],
  ['Tom', "Don't Stop Believin' - Journey"],
  ['Ada', 'Wannabe - Spice Girls'],
  ['Zoe', 'Valerie - Amy Winehouse'],
  ['Ivan', 'Mr. Brightside - The Killers'],
  ['June', '9 to 5 - Dolly Parton'],
  ['Omar', 'Karma Chameleon - Culture Club'],
  ['Lily', 'Total Eclipse of the Heart - Bonnie Tyler'],
  ['Max', 'Country Roads - John Denver'],
  ['Nina', 'Islands in the Stream - Kenny Rogers & Dolly Parton'],
].map(([userName, songTitle], i) => ({
  id: `sample-${i}`,
  userName,
  songTitle,
  videoId: 'sample00000',
}));

interface DisplayDesignerProps {
  onClose: () => void;
  config: DisplayConfig;
  onSave: (next: DisplayConfig) => void;
  joinUrl: string;
  joinCode: string;
  origin: string;
  queue: QueueEntry[];
  activeIndex: number;
}

export function DisplayDesigner({
  onClose,
  config,
  onSave,
  joinUrl,
  joinCode,
  origin,
  queue,
  activeIndex,
}: DisplayDesignerProps) {
  const { t } = useT();
  const [mode, setMode] = React.useState<PreviewMode>('live');
  const [selected, setSelected] = React.useState<SectionId | null>(null);

  function handleChange(patch: Partial<DisplayConfig>) {
    // Turning the idle promo on flips the preview to the idle state it lives in.
    if (patch.attractMode) setMode('idle');
    onSave({ ...config, ...patch });
  }

  function handleSelect(section: SectionId | null) {
    setSelected(section);
    // Sections that only exist in one preview state pull the preview there.
    if (section === 'attract') setMode('idle');
    if (section === 'nowPlaying' || section === 'reactions') setMode('live');
  }

  // Short real queues make the depth/size controls look inert — preview a
  // sample lineup instead (badged, so the host knows the TV shows the truth).
  const upcoming = queue.slice(activeIndex + 1);
  const useSample = upcoming.length < 4;
  const previewQueue = useSample ? SAMPLE_QUEUE : queue;
  const upNext = useSample ? SAMPLE_QUEUE : upcoming;
  const current = queue[activeIndex] ?? SAMPLE_QUEUE[0];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={p.designer} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.qrModalClose}
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          &times;
        </button>

        <div className={p.header}>
          <span className={p.title}>{t('host.display.title')}</span>
          <span className={p.hint}>{t('host.display.hint')}</span>
        </div>

        <div className={p.body}>
          <div className={p.previewCol}>
            <div className={p.tabs}>
              <button
                className={`${p.tab} ${mode === 'live' ? p.tabActive : ''}`}
                onClick={() => setMode('live')}
              >
                {t('host.display.tab.live')}
              </button>
              <button
                className={`${p.tab} ${mode === 'idle' ? p.tabActive : ''}`}
                onClick={() => setMode('idle')}
              >
                {t('host.display.tab.idle')}
              </button>
              {useSample && <span className={p.sampleBadge}>{t('host.display.sample')}</span>}
            </div>

            <DisplayPreview
              config={config}
              mode={mode}
              selected={selected}
              onSelect={handleSelect}
              onChange={handleChange}
              joinUrl={joinUrl}
              joinCode={joinCode}
              origin={origin}
              upNext={upNext}
              currentSinger={current.userName}
              currentSong={current.songTitle}
              queue={previewQueue}
              activeIndex={useSample ? 2 : activeIndex}
            />
          </div>

          <DesignerRail
            config={config}
            selected={selected}
            onSelect={handleSelect}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
