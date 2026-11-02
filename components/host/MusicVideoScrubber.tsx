import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { onPlayhead, PlayheadMessage } from "../../app/queue/roomChannel";
import { serverNow } from "../../lib/clockSkew";
import { serverPlayhead, targetSeconds } from "../../lib/musicVideoSync";

const TICK_MS = 500;
const SKIP_SECONDS = 5;
// A pasted link carries no duration.
const UNKNOWN_DURATION_MIN_S = 240;

export interface SongPlayback {
  isPlaying: boolean;
  playStartedAt: string | null;
  playPausedAt: string | null;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useKaraokeElapsed(joinCode: string, entryId: string, playback: SongPlayback): number {
  const playheadRef = React.useRef<PlayheadMessage | null>(null);
  const [, setTick] = React.useState(0);

  React.useEffect(() => onPlayhead(joinCode, (msg) => (playheadRef.current = msg)), [joinCode]);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = serverNow();
  return targetSeconds(serverPlayhead(playback, now), playheadRef.current, entryId, now, 0) ?? 0;
}

export function MusicVideoScrubber({
  joinCode,
  entryId,
  videoId,
  playback,
  durationSeconds,
  offsetSeconds,
  onChange,
}: {
  joinCode: string;
  entryId: string;
  videoId: string;
  playback: SongPlayback;
  durationSeconds: number | undefined;
  offsetSeconds: number;
  onChange: (offsetSeconds: number) => void;
}) {
  const { t } = useT();
  const elapsed = useKaraokeElapsed(joinCode, entryId, playback);
  const [dragValue, setDragValue] = React.useState<number | null>(null);

  const live = Math.max(0, elapsed + offsetSeconds);
  const max = durationSeconds ?? Math.max(UNKNOWN_DURATION_MIN_S, Math.ceil(live) + 60);
  const shown = Math.min(max, dragValue ?? live);

  function skip(delta: number) {
    onChange(Math.max(offsetSeconds + delta, Math.ceil(-elapsed * 4) / 4));
  }

  const inputRef = React.useRef<HTMLInputElement>(null);
  const elapsedRef = React.useRef(elapsed);
  elapsedRef.current = elapsed;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Native change, not pointerup: browsers can deliver a final input event after
  // pointerup, which would re-latch the drag. change always comes last, once.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    function commit() {
      onChangeRef.current(Math.round((Number(el!.value) - elapsedRef.current) * 4) / 4);
      setDragValue(null);
    }
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, []);

  return (
    <div className={styles.timing}>
      {/* A still, not a second player: a muted preview player would be a second
          autoplaying embed on the host page, which YouTube's terms don't allow. */}
      <div className={styles.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
        <img className={styles.previewThumb} alt="" src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} />
      </div>
      <input
        type="range"
        className={styles.timingSlider}
        min={0}
        max={max}
        step={0.25}
        value={shown}
        aria-label={t("musicVideo.card.timing")}
        aria-valuetext={`${clock(shown)} / ${clock(max)}`}
        style={{ "--played": `${(shown / max) * 100}%` } as React.CSSProperties}
        ref={inputRef}
        onChange={(e) => setDragValue(Number(e.currentTarget.value))}
      />
      <div className={styles.timingHead}>
        <button className={styles.skipBtn} aria-label={t("musicVideo.card.back")} onClick={() => skip(-SKIP_SECONDS)}>
          ↺ {SKIP_SECONDS}
        </button>
        <span className={styles.timingReadout}>
          {clock(shown)} / {durationSeconds ? clock(durationSeconds) : "–:––"}
        </span>
        <button className={styles.skipBtn} aria-label={t("musicVideo.card.forward")} onClick={() => skip(SKIP_SECONDS)}>
          {SKIP_SECONDS} ↻
        </button>
      </div>
      <div className={styles.timingFoot}>
        <span className={styles.timingHint}>{t("musicVideo.card.scrubHint")}</span>
        {offsetSeconds !== 0 && (
          <button className={styles.timingReset} onClick={() => onChange(0)}>
            {t("musicVideo.card.resetTiming")}
          </button>
        )}
      </div>
    </div>
  );
}
