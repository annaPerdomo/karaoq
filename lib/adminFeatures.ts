// One entry here is a room chip, a Rooms filter and a Features card.
// No server imports: components read this file too.

export type FeatureSlice = "duets" | "ideas";

export interface AdminFeature {
  id: string;
  label: string;
  name: string;
  types: readonly string[];
  slice?: FeatureSlice;
  /** The room card already shows this another way, so it gets no chip there. */
  noChip?: true;
}

export const ADMIN_FEATURES: readonly AdminFeature[] = [
  {
    id: "musicVideo",
    label: "Music video",
    name: "Music-video screen",
    types: ["music_video_screen_opened", "original_video_resolved", "music_video_link"],
  },
  { id: "ideas", label: "Song ideas", name: "Song ideas", types: ["song_added"], slice: "ideas" },
  {
    id: "boards",
    label: "Boards",
    name: "Boards",
    types: ["song_suggested", "singwithme_posted", "singwithme_joined", "singwithme_queued"],
  },
  { id: "swap", label: "Video swap", name: "Karaoke video swap", types: ["karaoke_video_swapped"] },
  { id: "outside", label: "Plays on YouTube", name: "Songs played on YouTube", types: ["external_opened"] },
  { id: "branding", label: "Branding", name: "Club branding", types: ["brand_saved", "logo_uploaded"] },
  { id: "duets", label: "Duets", name: "Duets & groups", types: ["song_added"], slice: "duets" },
  { id: "cheers", label: "Cheers", name: "Cheers", types: ["reaction_sent"], noChip: true },
  {
    id: "customize",
    label: "Customize",
    name: "Customize (display & host)",
    types: ["display_config_saved", "host_config_saved"],
  },
  { id: "fair", label: "Fair rotation", name: "Fair rotation changed", types: ["fair_mode_toggled"], noChip: true },
  {
    id: "autoAdvance",
    label: "Auto-advance",
    name: "Auto-advance changed",
    types: ["auto_advance_set"],
    noChip: true,
  },
  { id: "screenHelp", label: "Screen help", name: "Screen help sheet", types: ["screen_help_opened"] },
  { id: "tvPair", label: "TV pairing", name: "TV pairing", types: ["tv_paired"] },
  { id: "qrPrint", label: "QR print", name: "Printed QR", types: ["qr_printed"] },
  { id: "wrapUp", label: "Wrap-up time", name: "Wrap-up time", types: ["session_end_set"] },
  { id: "songLimit", label: "Song limit", name: "Song limit", types: ["song_limit_set"] },
  { id: "postpone", label: "Postpone", name: "Postpone my song", types: ["song_postponed"] },
];

/** Events a Features card counts beyond the ones that mark a room as a user. */
export const FEATURE_EXTRA_TYPES: readonly string[] = [
  "suggestion_used",
  "suggestion_claimed",
  "karaoke_swap_opened",
  "logo_upload_rejected",
];

export const FEATURE_EVENT_TYPES: readonly string[] = Array.from(
  new Set(ADMIN_FEATURES.flatMap((f) => f.types))
);

export function adminFeature(id: unknown): AdminFeature | null {
  return typeof id === "string" ? (ADMIN_FEATURES.find((f) => f.id === id) ?? null) : null;
}

export function featureMatch(feature: AdminFeature): Record<string, unknown> {
  const match: Record<string, unknown> = { type: { $in: [...feature.types] } };
  if (feature.slice === "duets") match.singers = { $gte: 2 };
  // $ne: null also excludes a missing field, like the $ifNull the tallies use.
  if (feature.slice === "ideas") match.suggestionKey = { $ne: null };
  return match;
}

export interface TypeTally {
  n: number;
  duets?: number;
  ideas?: number;
}

export function featureUsed(
  feature: AdminFeature,
  tallies: Record<string, TypeTally | undefined>
): boolean {
  return feature.types.some((type) => {
    const tally = tallies[type];
    if (!tally) return false;
    return (feature.slice ? (tally[feature.slice] ?? 0) : tally.n) > 0;
  });
}

export function featuresUsed(tallies: Record<string, TypeTally | undefined>): string[] {
  return ADMIN_FEATURES.filter((f) => featureUsed(f, tallies)).map((f) => f.id);
}
