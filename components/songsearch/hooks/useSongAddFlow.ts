import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';

import { YoutubeResult } from '../../../app/queue/searchYoutube';
import postEntryToQueue from '../../../app/queue/postEntryToQueue';
import { QueueEntry } from '../../../pages/api/types';

/** Where a confirm opened from when it wasn't a search result — a shelf card —
 *  so the add carries that card's song rather than the last search's. */
export interface ConfirmOrigin<S = unknown> {
  suggestionKey: string;
  fromCorpus: boolean;
  song: S;
}

interface UseSongAddFlowArgs {
  roomId: string;
  userName: string;
  requireName: boolean;
  onSongAdded: (entry: QueueEntry) => void;
  /**
   * When provided, the component acts as a song *picker* instead of adding to
   * the queue: the chosen result is returned to the caller and no name is
   * required.
   */
  onPick?: (song: YoutubeResult) => void;
  resetSearch: () => void;
  via: 'search' | 'paste';
  suggestionKey?: string | null;
  fromCorpus?: boolean | null;
}

// Owns the preview/confirm modal and the add-to-queue (or pick-and-return)
// flow it leads to.
export function useSongAddFlow<S = unknown>({
  roomId,
  userName,
  requireName,
  onSongAdded,
  onPick,
  resetSearch,
  via,
  suggestionKey,
  fromCorpus,
}: UseSongAddFlowArgs) {
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  // In-flight guard: on a slow connection a double-tapped Add would $push
  // two fresh-uuid entries — the same song queued twice.
  const [adding, setAdding] = React.useState(false);
  const [confirmSong, setConfirmSong] = React.useState<YoutubeResult | null>(null);
  const [confirmOrigin, setConfirmOrigin] = React.useState<ConfirmOrigin<S> | null>(null);
  const [previewPlaying, setPreviewPlaying] = React.useState(false);

  async function addSong(song: YoutubeResult) {
    if (!roomId || adding) return;
    if (requireName && !userName.trim()) return;

    const entry: QueueEntry = {
      id: uuidv4(),
      userName: userName.trim(),
      songTitle: song.title,
      videoId: song.videoId,
      // Feeds the queue-time estimate. Absent on degraded search results —
      // the estimate falls back to the room's average.
      ...(song.durationSeconds !== undefined
        ? { durationSeconds: song.durationSeconds }
        : {}),
    };

    setAdding(true);
    let ok = false;
    try {
      ok = await postEntryToQueue(
        roomId,
        entry,
        via,
        (confirmOrigin ? confirmOrigin.suggestionKey : suggestionKey) ?? undefined,
        (confirmOrigin ? confirmOrigin.fromCorpus : fromCorpus) ?? undefined
      );
    } catch {
      ok = false;
    } finally {
      setAdding(false);
    }
    if (ok) {
      onSongAdded(entry);
      resetSearch();
      setConfirmSong(null);
      setConfirmOrigin(null);
      setAddError(null);
      setJustAdded(entry.songTitle);
      setTimeout(() => setJustAdded(null), 3000);
    } else {
      setConfirmSong(null);
      setConfirmOrigin(null);
      setAddError(song.title);
      setTimeout(() => setAddError(null), 4000);
    }
  }

  // Open the preview/confirm modal for a search result. `autoplay` starts the
  // video straight away (when the user tapped the thumbnail to preview) vs.
  // showing the thumbnail first (when they tapped "+").
  function openConfirm(song: YoutubeResult, autoplay: boolean, origin?: ConfirmOrigin<S>) {
    setPreviewPlaying(autoplay);
    setConfirmSong(song);
    setConfirmOrigin(origin ?? null);
  }

  // In picker mode, hand the chosen song back to the caller and reset search.
  function handlePick(song: YoutubeResult) {
    onPick?.(song);
    resetSearch();
    setConfirmSong(null);
    setConfirmOrigin(null);
  }

  function closeConfirm() {
    setConfirmSong(null);
    setConfirmOrigin(null);
  }

  function playPreview() {
    setPreviewPlaying(true);
  }

  const canAdd = !!onPick || !requireName || userName.trim().length > 0;

  return {
    justAdded,
    addError,
    adding,
    confirmSong,
    confirmOrigin,
    previewPlaying,
    canAdd,
    addSong,
    openConfirm,
    handlePick,
    closeConfirm,
    playPreview,
  };
}
