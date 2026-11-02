// Translate a browse label by its data id, falling back to the curated
// English name when a locale hasn't translated that section/category.
export function labelWithFallback(
  t: (key: string) => string,
  key: string,
  fallback: string
): string {
  const v = t(key);
  return v === key ? fallback : v;
}

/** A category's display name. A voice list without its own translation reads
 *  as its range ("Low & warm"), so every place's lists name ranges alike. */
export function categoryLabel(
  t: (key: string) => string,
  category: { id: string; name: string; voice?: string }
): string {
  const fallback = category.voice ? labelWithFallback(t, `voice.${category.voice}`, category.name) : category.name;
  return labelWithFallback(t, `category.${category.id}`, fallback);
}
