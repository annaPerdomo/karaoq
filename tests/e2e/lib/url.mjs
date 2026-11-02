export function urlFor(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}
