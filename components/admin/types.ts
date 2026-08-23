import type { DayCount } from './chartData';
import type {
  FairToggle,
  LocaleCount,
  Person,
  RequestRow,
  RoomLanguages,
  SingWithMeRow,
} from './roomDetailLabels';

/** Response contract of GET /api/analytics/data. Nearly every sub-object is
 * optional so a dashboard served by an older deploy degrades to fewer panels
 * rather than a crash. */
export interface AnalyticsData {
  overview: {
    totalRooms: number;
    roomsToday: number;
    roomsThisWeek: number;
    totalSongs: number;
    totalReactions: number;
    uniqueUsers: number;
    avgSessionMinutes: number;
    maxSessionMinutes: number;
    medianSessionMinutes?: number;
    totalSessions: number;
    hostSessions: number;
    singerSessions: number;
    avgSongsPerRoom: number;
    maxSongsPerRoom: number;
    totalQrPrints: number;
  };
  charts: {
    roomsByDay: DayCount[];
    songsByDay: DayCount[];
    dayOfWeekSongs?: { _id: number; count: number }[];
    /**
     * Mongo $dayOfWeek: 1 = Sunday … 7 = Saturday. Absent on an older deploy.
     * Also the source of the hour-of-day chart — see hoursFromGrid.
     */
    activityGrid?: { _id: { dow: number; hour: number }; count: number }[];
  };
  geo: {
    countries: { _id: string; count: number }[];
    cities: { _id: { city: string; country: string; region: string }; count: number }[];
  };
  languages?: {
    bySession: {
      _id: string;
      sessions: number;
      rooms: number;
      hosts: number;
      singers: number;
      /** Sessions whose locale came from a deliberate pick, not a guess. */
      chosen: number;
    }[];
    byCountry: { _id: { country: string; locale: string }; count: number }[];
    uniqueRooms: number;
    nonEnglishRooms: number;
  };
  rankings: {
    topSongs: { _id: { title: string; videoId: string }; count: number }[];
    topUsers: { _id: string; count: number }[];
  };
  devices: { _id: string; count: number }[];
  suggestions: {
    total: number;
    bySource: { _id: string | null; count: number }[];
    bySection: { _id: string; count: number }[];
    byCategory: { _id: string; count: number }[];
    topSongs: { _id: { title: string; artist: string }; count: number }[];
    byDay: DayCount[];
  };
  funnel?: {
    windowDays: number;
    roomsCreated: number;
    roomsSearched: number;
    roomsWithSong: number;
    roomsEngaged: number;
    medianMinutesToFirstSong: number | null;
    p90MinutesToFirstSong: number | null;
  };
  engagement?: {
    songsPerRoomHistogram: { label: string; count: number }[];
    hosts: number;
    repeatHosts: number;
  };
  social?: {
    addsByVia: { _id: string; count: number }[];
    singWithMe: { posted: number; joined: number; queued: number };
    board: { suggested: number; claimed: number };
  };
  display?: SurfaceCustomization;
  hostSurface?: SurfaceCustomization;
  rotation?: {
    duetAdds: number;
    trackedAdds: number;
    bySize: { _id: number; count: number }[];
    fairRooms: number;
    fairEndedOn: number;
    fairToggled: number;
  };
  searchHealth?: SearchHealthData;
  linkLookups?: LinkLookupData;
  meta?: { timezone: string; generatedAt: string };
}

export interface SurfaceCustomization {
  saves: number;
  roomsCustomized: number;
  changedFields: { _id: string; count: number }[];
  themes: { _id: string; count: number }[];
}

export interface SearchHealthData {
  byDay: DayCount[];
  totals: { _id: { failReason?: string; searchOutcome?: string }; count: number }[];
  last24h: number;
}

/** Pasted-link usage over 30 days. */
export interface LinkLookupData {
  total: number;
  bySrc: { _id: string; count: number }[];
  byOutcome: { _id: string; count: number }[];
}

/** One row of GET /api/analytics/rooms. */
export interface RoomRow {
  roomId: string;
  timestamp: string;
  country?: string;
  city?: string;
  songs: number;
  cheers: number;
  requests: number;
  singWithMe: number;
  searches: number;
  duets: number;
  errors: number;
  participants: number;
  /** Most recent participant heartbeat; drives the "live" badge. */
  lastSeen?: string | null;
  /** null where the room predates the flag. */
  fairMode?: boolean | null;
  fairToggled?: boolean;
  /** The language the room was CREATED in; null where the room predates recording. */
  locale?: string | null;
  localeMix?: LocaleCount[];
}

/** One raw error occurrence in a room, in chronological order. */
export interface RoomErrorRow {
  message: string;
  source: string;
  page?: string | null;
  timestamp: string;
}

export interface RoomSuggestionRow {
  source: string;
  sectionId: string | null;
  categoryId: string | null;
  songTitle: string | null;
  songArtist: string | null;
  timestamp: string;
}

/** One failed /api/search attributed to this room. */
export interface RoomSearchFailRow {
  failReason: string | null;
  searchOutcome: string | null;
  timestamp: string;
}

/** Response contract of GET /api/analytics/room. */
export interface RoomDossierData {
  roomId: string;
  people: Person[];
  songs: DossierSongRow[];
  requests: RequestRow[];
  singWithMe: SingWithMeRow[];
  suggestions?: RoomSuggestionRow[];
  cheers?: {
    total: number;
    byEmoji: { emoji: string; count: number }[];
    topCheerers: { userName: string; count: number }[];
  };
  errors?: RoomErrorRow[];
  searchFails?: RoomSearchFailRow[];
  fairRotation: {
    started: boolean | null;
    final: boolean | null;
    toggles: FairToggle[];
  };
  layout?: {
    display: import('../../pages/api/types').DisplayConfig | null;
    host: import('../../pages/api/types').HostConfig | null;
    displaySaves: number;
    hostSaves: number;
  };
  languages?: RoomLanguages;
  span?: { first: string; last: string } | null;
  sessionEnd?: { minutesFromNow: number | null; timestamp: string } | null;
  counts: {
    people: number;
    songs: number;
    requests: number;
    singWithMe: number;
    suggestions?: number;
    reactions: number;
    searches: number;
    errors?: number;
  };
}

export interface DossierSongRow {
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  via: string;
  singers?: number | null;
  timestamp: string;
}

/** Response contract of GET /api/analytics/errors. */
export interface ErrorsData {
  windowDays: number;
  totals: { last24h: number; last7d: number; total: number; roomsAffected: number };
  groups: ErrorGroupData[];
  recent: {
    message: string;
    source: string;
    page?: string;
    roomId: string;
    country?: string;
    timestamp: string;
  }[];
}

export interface ErrorGroupData {
  message: string;
  source: string;
  count: number;
  byDay: DayCount[];
  firstSeen: string;
  lastSeen: string;
  sampleStack?: string | null;
  samplePage?: string | null;
  rooms: string[];
  roomCount: number;
}

export type AdminView = 'rooms' | 'errors' | 'suggestions' | 'pulse' | 'feedback';
