/** Field-wise equality for a flat config object, comparing only the given keys.
 * Arrays compare by joined value (order-sensitive). Shared by the display and
 * host edit hooks to tell a pristine draft from an edited one. */
export function configsEqual<C>(a: C, b: C, keys: (keyof C)[]): boolean {
  return keys.every((key) => {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) return x.join(',') === y.join(',');
    return x === y;
  });
}
