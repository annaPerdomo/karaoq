import {
  ALL_CATEGORIES,
  SongCategory,
  SongSection,
} from '../../app/queue/songSuggestions';
import { HOT_TAB, LANG_IDS, INITIAL_CATEGORY_SONGS } from './constants';

interface BuildDiscoveryDataArgs {
  orderedSections: SongSection[];
  langPacks: SongSection[];
  regionalSection: SongSection | null;
  activeTab: string;
  activeCategory: string | null;
  expandedCategory: boolean;
  /** Pre-translated label for the synthetic "Hot" tab. Always offered: its
   *  place picker is the only way to the language lists' classics. */
  hotTabLabel: string;
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
  hotTabLabel,
}: BuildDiscoveryDataArgs) {
  const nonLangSections = orderedSections.filter((s) => !LANG_IDS.includes(s.id));
  const TAB_DEFS = [
    { id: HOT_TAB, label: hotTabLabel, categories: [] as SongCategory[] },
    ...nonLangSections,
  ];
  // Every language list, the country's promoted pack included: its own tab
  // stays, and the Hot tab shows it as its place's classics.
  const placeSections = [
    ...orderedSections.filter((s) => LANG_IDS.includes(s.id)),
    ...langPacks,
    ...(regionalSection && !langPacks.some((p) => p.id === regionalSection.id)
      ? [regionalSection]
      : []),
  ];
  const isHotTab = activeTab === HOT_TAB;

  const currentSection = isHotTab
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
    placeSections,
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
