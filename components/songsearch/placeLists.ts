import {
  SONG_SECTIONS,
  SongCategory,
  SongSection,
  SongSuggestion,
} from '../../app/queue/songSuggestions';
import { CHART_COUNTRIES } from '../../lib/chartCountries';
import { placeLanguage } from '../../lib/placeLanguage';
import type { GenreShelf } from '../../lib/shelfTypes';

/** The language list each language's places share: Mexico, Spain and Peru all
 *  get the Spanish one. A language without one falls back to the core lists. */
export const LANGUAGE_SECTION: Record<string, string> = {
  es: 'spanish',
  ja: 'japanese',
  ko: 'kpop',
  pt: 'brasil',
  fil: 'opm',
  de: 'deutsch',
  fr: 'francais',
  id: 'indonesia',
  cs: 'cesko',
  hi: 'bollywood',
};

export const BUNDLED_SECTIONS = ['spanish', 'japanese', 'kpop'];

export const SECTION_PACK: Record<string, string> = {
  brasil: 'br',
  cesko: 'cz',
  deutsch: 'de',
  francais: 'fr',
  indonesia: 'id',
  bollywood: 'in',
  opm: 'ph',
};

export interface CategoryGroup {
  /** "local" lists are the place's own; "international" are the core lists a
   *  home place also gets. null: the only group, so no heading. */
  heading: 'local' | 'international' | null;
  categories: SongCategory[];
}

export interface PlaceLists {
  genres: CategoryGroup[];
  voice: CategoryGroup[];
}

export function sectionIdForPlace(place: string): string | null {
  return place ? LANGUAGE_SECTION[placeLanguage(place)] ?? null : null;
}

/** Every place the picker offers: each charted country, plus the singer's own
 *  ("" when we don't know where they are). */
export function placesFor(home: string | null): string[] {
  const all = CHART_COUNTRIES.map((cc) => cc.toUpperCase());
  const own = home ?? '';
  return all.indexOf(own) >= 0 ? all : [own].concat(all);
}

const VOICE_ORDER = ['low', 'mid', 'high', 'easy'];

const core = (id: string) => SONG_SECTIONS.find((s) => s.id === id)?.categories ?? [];

/**
 * What the Genres and Voice tabs show for a place. A place with its own
 * language list leads with it; the singer's own place also keeps the core
 * (international) lists, since rooms everywhere sing English hits too. A place
 * with no list of its own gets the core lists.
 */
export function placeLists(place: string, isHome: boolean, sections: SongSection[]): PlaceLists {
  const id = sectionIdForPlace(place);
  const section = id ? sections.find((s) => s.id === id) ?? null : null;
  const coreGenres = core('genre');
  const coreVoice = core('voice-type');
  if (!section) {
    return {
      genres: [{ heading: null, categories: coreGenres }],
      voice: [{ heading: null, categories: coreVoice }],
    };
  }
  const localGenres = section.categories.filter((c) => !c.voice);
  // The core lists' order, so every place's ranges line up the same way.
  const localVoice = section.categories
    .filter((c) => !!c.voice)
    .sort((a, b) => VOICE_ORDER.indexOf(a.voice!) - VOICE_ORDER.indexOf(b.voice!));
  const build = (local: SongCategory[], international: SongCategory[]): CategoryGroup[] => {
    if (local.length === 0) return [{ heading: null, categories: international }];
    return isHome
      ? [
          { heading: 'local', categories: local },
          { heading: 'international', categories: international },
        ]
      : [{ heading: null, categories: local }];
  };
  return { genres: build(localGenres, coreGenres), voice: build(localVoice, coreVoice) };
}

export interface SurprisePick {
  song: SongSuggestion;
  key?: string;
}

const CROSS_BORDER: Record<string, string> = { kpop: 'KR', jpop: 'JP' };

/** A place without lists of its own keeps the core lists: its charts alone
 *  would drop the karaoke classics. */
export function surprisePool(lists: PlaceLists, liveGenres: GenreShelf[]): SurprisePick[] {
  const all = lists.genres.concat(lists.voice).flatMap((g) => g.categories);
  const coreIds = new Set(core('genre').concat(core('voice-type')).map((c) => c.id));
  const own = all.filter((c) => !coreIds.has(c.id));
  const curated: SurprisePick[] = (own.length > 0 ? own : all).flatMap((c) =>
    c.songs.map((song) => ({ song }))
  );
  const charted: SurprisePick[] = liveGenres
    .filter((g) => !CROSS_BORDER[g.slug] || CROSS_BORDER[g.slug] === g.country)
    .flatMap((g) => g.songs.map((s) => ({ song: s, key: s.key })));
  return curated.concat(charted);
}
