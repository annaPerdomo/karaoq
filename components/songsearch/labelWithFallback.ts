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
