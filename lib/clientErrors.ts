import { MAX_ENTRY_ID_LENGTH } from "./limits";

// Caps on the anonymous error-report endpoint, for the same reason every other
// public write is capped: an uncapped field is an uncapped document. The stack
// cap keeps the top frames — where the failing function lives — and drops the
// framework noise below them.
export const MAX_ERROR_MESSAGE_LENGTH = 300;
export const MAX_ERROR_STACK_LENGTH = 800;
export const MAX_ERROR_PAGE_LENGTH = 200;

export const CLIENT_ERROR_SOURCES = ["window", "promise"] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];

export interface SanitizedClientError {
  message: string;
  source: ClientErrorSource;
  /** "" when the error happened outside a room page. */
  roomId: string;
  stack?: string;
  page?: string;
}

/**
 * The message is required and over-length is truncated rather than rejected: an
 * error report is diagnostic exhaust, and a report that arrives clipped still
 * says what broke, whereas a 400 loses it entirely.
 */
export function sanitizeClientError(body: unknown): SanitizedClientError | null {
  if (!body || typeof body !== "object") return null;
  const e = body as Record<string, unknown>;

  if (typeof e.message !== "string") return null;
  const message = e.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
  if (message.length === 0) return null;

  const source = CLIENT_ERROR_SOURCES.includes(e.source as ClientErrorSource)
    ? (e.source as ClientErrorSource)
    : "window";

  // Uppercased here too, not just in the reporter: this endpoint is public, and
  // a room key that doesn't match the canonical form is a report nothing finds.
  const roomId =
    typeof e.roomId === "string" && e.roomId.length <= MAX_ENTRY_ID_LENGTH
      ? e.roomId.toUpperCase()
      : "";

  const capped = (value: unknown, max: number): string | undefined =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim().slice(0, max)
      : undefined;

  return {
    message,
    source,
    roomId,
    stack: capped(e.stack, MAX_ERROR_STACK_LENGTH),
    page: capped(e.page, MAX_ERROR_PAGE_LENGTH),
  };
}
