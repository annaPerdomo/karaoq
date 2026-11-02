import { SongSection } from '../../app/queue/songSuggestions';
import { INITIAL_CATEGORY_SONGS } from './constants';

interface BuildDiscoveryDataArgs {
  /** Bundled sections plus whichever language packs have loaded. */
  allSections: SongSection[];
  activeCategory: string | null;
  expandedCategory: boolean;
}

// Pure derivation of the open category's song list from the loaded sections
// and current selection.
export function buildDiscoveryData({
  allSections,
  activeCategory,
  expandedCategory,
}: BuildDiscoveryDataArgs) {
  const parentSection = allSections.find((s) =>
    s.categories.some((c) => c.id === activeCategory)
  );
  const expandedData = parentSection?.categories.find((c) => c.id === activeCategory);
  const songs = expandedData?.songs ?? [];
  const visible = expandedCategory ? songs : songs.slice(0, INITIAL_CATEGORY_SONGS);
  const hasMore = songs.length > INITIAL_CATEGORY_SONGS;

  return { expandedData, parentSection, songs, visible, hasMore };
}
