import {
  ALL_CATEGORIES,
  SongCategory,
  SongSection,
} from '../../app/queue/songSuggestions';
import { HOT_TAB, LANG_IDS, INITIAL_CATEGORY_SONGS, WORLD_TAB } from './constants';

interface BuildDiscoveryDataArgs {
  orderedSections: SongSection[];
  langPacks: SongSection[];
  regionalSection: SongSection | null;
  activeTab: string;
  activeCategory: string | null;
  expandedCategory: boolean;
  /** Pre-translated label for the synthetic "World" tab. */
  worldTabLabel: string;
  /** Pre-translated label for the synthetic "Hot" tab; the tab exists only
   *  when there are shelves to put in it. */
  hotTabLabel: string;
  hasShelves: boolean;
}

// Pure derivation of the browse view's tabs/categories/expanded-song-list
// from the raw section data and current selection.
export function buildDiscoveryData({
  orderedSections,
  langPacks,
  regionalSection,
  activeTab,
  activeCategory,
  expandedCategory,
  worldTabLabel,
  hotTabLabel,
  hasShelves,
}: BuildDiscoveryDataArgs) {
  const nonLangSections = orderedSections.filter((s) => !LANG_IDS.includes(s.id));
  const TAB_DEFS = [
    ...(hasShelves ? [{ id: HOT_TAB, label: hotTabLabel, categories: [] as SongCategory[] }] : []),
    ...nonLangSections,
    { id: WORLD_TAB, label: worldTabLabel, categories: [] as SongCategory[] },
  ];
  // Every language list, the country's promoted pack included: its own tab
  // stays, and its place in the World tab shows it beside the chart.
  const worldSections = [
    ...orderedSections.filter((s) => LANG_IDS.includes(s.id)),
    ...langPacks,
    ...(regionalSection && !langPacks.some((p) => p.id === regionalSection.id)
      ? [regionalSection]
      : []),
  ];
  const isWorldTab = activeTab === WORLD_TAB;
  const isHotTab = hasShelves && activeTab === HOT_TAB;

  const currentSection = isWorldTab || isHotTab
    ? null
    : nonLangSections.find((s) => s.id === activeTab) ?? nonLangSections[0];

  const allVisibleCats = currentSection?.categories ?? [];

  const allCategories = [
    ...(regionalSection?.categories ?? []),
    ...langPacks.flatMap((p) => p.categories),
    ...ALL_CATEGORIES,
  ];
  const expandedData = allCategories.find((c) => c.id === activeCategory);
  const parentSection = [...orderedSections, ...langPacks].find((s) =>
    s.categories.some((c) => c.id === activeCategory)
  );
  const songs = expandedData?.songs ?? [];
  const visible = expandedCategory ? songs : songs.slice(0, INITIAL_CATEGORY_SONGS);
  const hasMore = songs.length > INITIAL_CATEGORY_SONGS;

  return {
    TAB_DEFS,
    worldSections,
    isWorldTab,
    isHotTab,
    currentSection,
    allVisibleCats,
    expandedData,
    parentSection,
    songs,
    visible,
    hasMore,
  };
}
