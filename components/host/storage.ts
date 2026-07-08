export function playModeStorageKey(joinCode: string): string {
  return `karaoq_play_mode_${joinCode}`;
}

// Token minted when THIS device starts a song in "here" mode; matches
// Room.playToken while our playback is the live one. Persisted so a reload
// can prove to the server that the previous playback surface was ours.
export function playTokenStorageKey(joinCode: string): string {
  return `karaoq_play_token_${joinCode}`;
}

export function readStoredPlayToken(joinCode: string): string | null {
  try {
    return localStorage.getItem(playTokenStorageKey(joinCode));
  } catch {
    return null;
  }
}

export function qrHiddenStorageKey(joinCode: string): string {
  return `karaoq_qr_hidden_${joinCode}`;
}

export function cheersHiddenStorageKey(joinCode: string): string {
  return `karaoq_cheers_hidden_${joinCode}`;
}
