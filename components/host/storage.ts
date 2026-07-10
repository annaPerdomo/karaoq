export function playModeStorageKey(joinCode: string): string {
  return `karaoq_play_mode_${joinCode}`;
}

// Token minted when THIS TAB starts a song in "here" mode; matches
// Room.playToken while our playback is the live one. It lives in
// sessionStorage (per-tab) — in localStorage a second host tab would present
// the playing tab's token on mount and the server would mistake it for the
// playback surface reloading, resetting isPlaying and cutting the live song.
// sessionStorage survives a same-tab reload, and a localStorage mirror
// written on pagehide (consumed exactly once by the next mount) covers the
// close-tab-then-reopen restore.
export function playTokenStorageKey(joinCode: string): string {
  return `karaoq_play_token_${joinCode}`;
}

export function readStoredPlayToken(joinCode: string): string | null {
  const key = playTokenStorageKey(joinCode);
  try {
    const own = sessionStorage.getItem(key);
    if (own) {
      // A reload writes the mirror (pagehide) but keeps sessionStorage, so
      // clean up our own leftover copy — otherwise a second tab could later
      // adopt this live tab's token and cut its playback.
      try {
        if (localStorage.getItem(key) === own) localStorage.removeItem(key);
      } catch {}
      return own;
    }
  } catch {}
  try {
    // Adopt the pagehide mirror into this tab and delete it, so only the
    // first tab to reopen the room claims the dead surface's token.
    const mirrored = localStorage.getItem(key);
    if (mirrored) {
      localStorage.removeItem(key);
      try {
        sessionStorage.setItem(key, mirrored);
      } catch {}
      return mirrored;
    }
  } catch {}
  return null;
}

export function storePlayToken(joinCode: string, token: string): void {
  try {
    sessionStorage.setItem(playTokenStorageKey(joinCode), token);
  } catch {}
}

// Copy this tab's token to localStorage as the tab goes away, so a genuine
// restore-after-close can still prove past ownership to the server.
export function mirrorPlayTokenForRestore(joinCode: string): void {
  try {
    const token = sessionStorage.getItem(playTokenStorageKey(joinCode));
    if (token) localStorage.setItem(playTokenStorageKey(joinCode), token);
  } catch {}
}

export function qrHiddenStorageKey(joinCode: string): string {
  return `karaoq_qr_hidden_${joinCode}`;
}

export function cheersHiddenStorageKey(joinCode: string): string {
  return `karaoq_cheers_hidden_${joinCode}`;
}
