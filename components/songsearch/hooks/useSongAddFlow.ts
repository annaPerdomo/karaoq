import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';

import { YoutubeResult } from '../../../app/queue/searchYoutube';
import postEntryToQueue from '../../../app/queue/postEntryToQueue';
import { QueueEntry } from '../../../pages/api/types';

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
}

// Owns the preview/confirm modal and the add-to-queue (or pick-and-return)
// flow it leads to.
export function useSongAddFlow({
  roomId,
  userName,
  requireName,
  onSongAdded,
  onPick,
  resetSearch,
  via,
}: UseSongAddFlowArgs) {
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [addError, setAddError] = React.useState<string | null>(null);
  // In-flight guard: on a slow connection a double-tapped Add would $push
  // two fresh-uuid entries — the same song queued twice.
  const [adding, setAdding] = React.useState(false);
  const [confirmSong, setConfirmSong] = React.useState<YoutubeResult | null>(null);
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
      ok = await postEntryToQueue(roomId, entry, via);
    } catch {
      ok = false;
    } finally {
      setAdding(false);
    }
    if (ok) {
      onSongAdded(entry);
      resetSearch();
      setConfirmSong(null);
      setAddError(null);
      setJustAdded(entry.songTitle);
      setTimeout(() => setJustAdded(null), 3000);
    } else {
      setConfirmSong(null);
      setAddError(song.title);
      setTimeout(() => setAddError(null), 4000);
    }
  }

  // Open the preview/confirm modal for a search result. `autoplay` starts the
  // video straight away (when the user tapped the thumbnail to preview) vs.
  // showing the thumbnail first (when they tapped "+").
  function openConfirm(song: YoutubeResult, autoplay: boolean) {
    setPreviewPlaying(autoplay);
    setConfirmSong(song);
  }

  // In picker mode, hand the chosen song back to the caller and reset search.
  function handlePick(song: YoutubeResult) {
    onPick?.(song);
    resetSearch();
    setConfirmSong(null);
  }

  function closeConfirm() {
    setConfirmSong(null);
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
    previewPlaying,
    canAdd,
    addSong,
    openConfirm,
    handlePick,
    closeConfirm,
    playPreview,
  };
}
