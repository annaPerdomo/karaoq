// Shared by the suggestion endpoints and the browser, so no Mongo imports here.

export interface ShelfSong {
  /** karaoke_songs._id — the suggestionKey an add from this row carries. */
  key: string;
  title: string;
  artist: string;
  nativeTitle?: string;
  nativeArtist?: string;
  /** Position on the shelf's chart, hot shelves only. */
  rank?: number;
  /** Places climbed since the previous chart; negative is a fall. */
  climb?: number;
  /** (Re)entered this chart within the last NEW_FOR_DAYS (lib/shelves). */
  isNew?: boolean;
  /** Distinct rooms that queued it in the window, rooms shelf only. */
  rooms?: number;
}

export type ShelfId = "hot" | "rooms";

/** How far the shelf had to widen to find enough songs. */
export type ShelfScope = "country" | "language" | "world";

export interface IdeaShelf {
  id: ShelfId;
  scope: ShelfScope;
  /** Uppercase country code, when scope is "country". */
  country: string | null;
  /** Language code (a UI locale, or e.g. "zh" for a chart with no UI locale),
   *  when scope is "language". */
  language: string | null;
  songs: ShelfSong[];
}
