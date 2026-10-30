// Shared by the suggestion endpoints and the browser, so no Mongo imports here.

/** The rooms shelf's window, also named in the line under that shelf. */
export const ROOMS_WINDOW_DAYS = 14;
/** Must not exceed youtube_song_data's 30-day TTL (lib/mongodb). */
export const COUNTRY_ROOMS_WINDOW_DAYS = 30;

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
  /** Percent of the scope's singing rooms that queued it in the window, rooms
   *  shelf only. Deliberately not the count of rooms. */
  roomShare?: number;
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
  /** Chart shelves: the countries whose Apple Music charts it draws on, and
   *  when the newest was fetched (ISO). Shown under the shelf so a singer can
   *  see where "hot" comes from. */
  chartCountries?: string[];
  updatedAt?: string;
  windowDays?: number;
}

export interface GenreShelf {
  slug: string;
  name: string;
  emoji: string;
  /** Uppercase. */
  country: string;
  /** Uppercase; not always the place's own (Korea's is the US store). */
  store: string;
  songs: ShelfSong[];
  /** ISO. */
  updatedAt?: string;
}
