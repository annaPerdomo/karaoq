import * as React from 'react';

import getRoom, { isRoom } from './getRoom';
import { Room, SingWithMePost, SuggestedSong } from '../../pages/api/types';

// Shared by the host and singer screens: it's the same panel, so a person who
// tucks it away on one surface means it.
const hiddenKey = (roomId: string) => `karaoq_boards_hidden_${roomId}`;

export interface Boards {
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  open: boolean;
  toggleOpen: () => void;
  /** Feed in a room snapshot the caller already fetched (init or poll tick). */
  applyRoom: (room: Room) => void;
  /** Re-pull the room now, so a post/join lands without waiting for a poll. */
  refresh: () => Promise<void>;
}

/**
 * State behind the "Sing together & requests" panel, shared by the host and
 * singer screens.
 *
 * The caller keeps driving its own polling and passes each snapshot to
 * `applyRoom`; this hook never polls on its own, so it can't double up on a
 * screen that already fetches the room every few seconds. `onRefreshed` runs
 * after `refresh()`, letting the caller sync whatever else the write may have
 * changed — a "sing with me" join can auto-add the song to the queue.
 */
export default function useBoards(
  roomId: string | undefined,
  onRefreshed?: (room: Room) => void
): Boards {
  const [singWithMe, setSingWithMe] = React.useState<SingWithMePost[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestedSong[]>([]);
  const [open, setOpen] = React.useState(true);

  // Held in a ref so `refresh` keeps a stable identity: callers pass an inline
  // arrow, which would otherwise rebuild the callback (and any effect that
  // depends on it) on every render.
  const onRefreshedRef = React.useRef(onRefreshed);
  React.useEffect(() => {
    onRefreshedRef.current = onRefreshed;
  }, [onRefreshed]);

  React.useEffect(() => {
    if (!roomId) return;
    try {
      setOpen(localStorage.getItem(hiddenKey(roomId)) !== '1');
    } catch {
      /* private mode — default stays open */
    }
  }, [roomId]);

  const toggleOpen = React.useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (roomId) {
        try {
          localStorage.setItem(hiddenKey(roomId), next ? '0' : '1');
        } catch {
          /* private mode — just won't be remembered */
        }
      }
      return next;
    });
  }, [roomId]);

  const applyRoom = React.useCallback((room: Room) => {
    setSingWithMe(room.singWithMe ?? []);
    setSuggestions(room.suggestions ?? []);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!roomId) return;
    const room = await getRoom(roomId);
    if (!isRoom(room)) return; // transient blip — the next poll tick heals it
    setSingWithMe(room.singWithMe ?? []);
    setSuggestions(room.suggestions ?? []);
    onRefreshedRef.current?.(room);
  }, [roomId]);

  return { singWithMe, suggestions, open, toggleOpen, applyRoom, refresh };
}
