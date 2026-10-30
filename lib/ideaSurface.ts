export const IDEA_SURFACES = ["hot", "rooms", "genre", "voice", "random"] as const;
export type IdeaSurface = (typeof IDEA_SURFACES)[number];

export interface IdeaOrigin {
  surface: IdeaSurface;
  /** Browsing a country other than the singer's own. */
  away: boolean;
}

export function ideaFields(body: { ideaSurface?: unknown; ideaAway?: unknown }): {
  ideaSurface?: IdeaSurface;
  ideaAway?: boolean;
} {
  const surface = (IDEA_SURFACES as readonly unknown[]).indexOf(body.ideaSurface) >= 0
    ? (body.ideaSurface as IdeaSurface)
    : undefined;
  if (!surface) return {};
  return { ideaSurface: surface, ...(typeof body.ideaAway === "boolean" ? { ideaAway: body.ideaAway } : {}) };
}
