// Shared by the shelves endpoint and the browser, so no Mongo imports here.

export type ShelfId = "hot" | "rooms";

export interface ShelfSong {
  /** karaoke_songs._id — the suggestionKey an add from this card carries. */
  key: string;
  title: string;
  artist: string;
  nativeTitle?: string;
  nativeArtist?: string;
  /** The cut a tap opens: the "Most sung" pick when there is one. */
  videoId: string;
  videoTitle: string;
  thumbnailUrl: string;
  durationSeconds?: number;
  /** Chart position, hot shelf only. */
  rank?: number;
  /** Places climbed since the previous chart; negative is a fall. */
  climb?: number;
  /** (Re)entered this chart within the last NEW_FOR_DAYS (lib/shelves). */
  isNew?: boolean;
  /** Distinct rooms that queued it in the window, rooms shelf only. */
  rooms?: number;
}

export interface IdeaShelf {
  id: ShelfId;
  /** Uppercase country code the shelf is about; null means worldwide. */
  country: string | null;
  songs: ShelfSong[];
}
