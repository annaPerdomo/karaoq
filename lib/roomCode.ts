/**
 * Room codes are case-insensitive: their canonical form is always uppercase.
 *
 * Normalizes a raw room code or route/query param — which may arrive as a
 * string, a string[] (from catch-all routes), or undefined — to the canonical
 * uppercase form. Non-string values pass through untouched so callers can run
 * their own validation (e.g. `typeof roomId !== "string"`) afterwards.
 */
export function normalizeRoomId(
  rawId: string | string[] | undefined
): string | string[] | undefined {
  return typeof rawId === "string" ? rawId.toUpperCase() : rawId;
}
