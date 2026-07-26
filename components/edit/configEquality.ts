export function configsEqual<C>(a: C, b: C, keys: (keyof C)[]): boolean {
  return keys.every((key) => {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) return x.join(',') === y.join(',');
    return x === y;
  });
}
