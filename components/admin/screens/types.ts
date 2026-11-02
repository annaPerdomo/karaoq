// Wire shape of GET /api/analytics/screens. Lives here rather than in
// components/admin/types.ts, which is at its size limit.

export const SCREENS_WINDOWS = [7, 30, 90] as const;
export type ScreensWindow = (typeof SCREENS_WINDOWS)[number];

export type ResolveSource = 'cache' | 'live' | 'quota' | 'busy' | 'none';
export type LogoRejectReason = 'type' | 'size' | 'storage_full';
export type BrandSurface = 'host' | 'display';
export type KaraokeSwapSource = 'candidate' | 'search' | 'link';

export interface ScreensFeedbackEntry {
  id: string;
  createdAt: string;
  kind: string;
  message: string;
  page?: string;
}

export interface ScreensStats {
  days: number;
  musicVideo: {
    /** Distinct rooms with music_video_screen_opened. */
    rooms: number;
    opens: number;
    /** Rooms that opened it on ≥2 distinct UTC days in the window. */
    repeatRooms: number;
    medianMinutesOpen: number | null;
    /** Summed from music_video_screen_closed, which only fires on pagehide — a TV
     *  powered off never reports, so the rates use the resolve counts instead. */
    songsShown: number;
    songsUnavailable: number;
    songsResolved: number;
    songsWithVideo: number;
    swaps: number;
    resolve: Record<ResolveSource, number>;
    errors: { code: number; count: number }[];
    /** music_video_offset count. */
    songsNudged: number;
    medianAbsOffset: number | null;
    links: { open: number; copy: number };
    /** YYYY-MM-DD, one per UTC day in the window, zero-filled. */
    daily: { day: string; rooms: number }[];
  };
  karaokeSwap: {
    /** karaoke_swap_opened: the host opened the sheet, whether or not they swapped. */
    opens: number;
    swaps: number;
    rooms: number;
    /** Swaps of the song on stage, playing — the singer was already up there. */
    live: number;
    medianSwapAtSeconds: number | null;
    sources: Record<KaraokeSwapSource, number>;
    /** The cuts hosts swapped away from, most first. Titles expire at 30 days. */
    swappedAway: { title: string; swaps: number }[];
    daily: { day: string; swaps: number }[];
  };
  brand: {
    /** Distinct rooms with a brand_saved logo:true in the window. */
    roomsWithLogo: number;
    roomsWithColors: number;
    saves: Record<BrandSurface, number>;
    clears: number;
    uploads: number;
    rejected: Record<LogoRejectReason, number>;
    /** logoStoreBytes(). */
    storageBytes: number;
    /** LOGO_STORE_BUDGET_BYTES. */
    storageBudgetBytes: number;
    /** room_logos docs without expireAt. */
    committedLogos: number;
  };
  /** Up to 20 newest entries in the window from a "/video" page or a room
   *  that used either feature. */
  feedback: ScreensFeedbackEntry[];
}
