import {
  ALL_CATEGORIES,
  SongCategory,
  SongSection,
} from '../../app/queue/songSuggestions';
import { LANG_IDS, INITIAL_CATEGORY_SONGS } from './constants';

interface BuildDiscoveryDataArgs {
  orderedSections: SongSection[];
  langPacks: SongSection[];
  regionalSection: SongSection | null;
  activeTab: string;
  activeCategory: string | null;
  expandedCategory: boolean;
  selectedLang: string | null;
  trendingCategory: SongCategory | null;
  /** Pre-translated label for the synthetic "Language" tab. */
  languageTabLabel: string;
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
  selectedLang,
  trendingCategory,
  languageTabLabel,
}: BuildDiscoveryDataArgs) {
  const nonLangSections = orderedSections.filter((s) => !LANG_IDS.includes(s.id));
  const TAB_DEFS = [
    ...nonLangSections,
    { id: 'language', label: languageTabLabel, categories: [] as SongCategory[] },
  ];
  const langSections = [
    ...orderedSections.filter((s) => LANG_IDS.includes(s.id)),
    // Skip the pack already promoted to its own tab for this country.
    ...langPacks.filter((p) => p.id !== regionalSection?.id),
  ];
  const isLangTab = activeTab === 'language';

  const currentSection = isLangTab
    ? null
    : nonLangSections.find((s) => s.id === activeTab) ?? nonLangSections[0];
  const currentLang = langSections.find((s) => s.id === selectedLang) ?? langSections[0];

  const firstTabId = nonLangSections[0]?.id;
  const baseCats = isLangTab
    ? langSections.flatMap((s) => s.categories)
    : currentSection?.categories ?? [];
  // Trending sits at the end of the first tab's grid.
  const allVisibleCats =
    trendingCategory && !isLangTab && currentSection?.id === firstTabId
      ? [...baseCats, trendingCategory]
      : baseCats;

  const allCategories = [
    ...(trendingCategory ? [trendingCategory] : []),
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
    langSections,
    isLangTab,
    currentSection,
    currentLang,
    allVisibleCats,
    expandedData,
    parentSection,
    songs,
    visible,
    hasMore,
  };
}
