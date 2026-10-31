import * as React from "react";
import { QueueEntry } from "../../pages/api/types";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { KaraokeVideoCard } from "./KaraokeVideoCard";
import { MusicVideoCard, musicVideoCardVisible } from "./MusicVideoCard";
import { SongPlayback } from "./MusicVideoScrubber";
import { SwapSource } from "./VideoSwapPanel";

export type KaraokeSwapHandler = (
  entryId: string,
  video: OriginalVideoCandidate,
  source: SwapSource
) => void;

export function SongVideoCards({
  joinCode,
  remote,
  currentSong,
  musicVideoAt,
  playback,
  onSwapKaraoke,
}: {
  joinCode: string;
  remote: boolean;
  currentSong: QueueEntry | undefined;
  musicVideoAt: string | null;
  playback: SongPlayback;
  onSwapKaraoke: KaraokeSwapHandler;
}) {
  if (remote || !currentSong) return null;
  return (
    <>
      <KaraokeVideoCard
        joinCode={joinCode}
        activeEntry={currentSong}
        live={playback.isPlaying}
        onSwap={onSwapKaraoke}
      />
      {musicVideoCardVisible(remote, musicVideoAt, currentSong) && (
        <MusicVideoCard joinCode={joinCode} activeEntry={currentSong} playback={playback} />
      )}
    </>
  );
}
