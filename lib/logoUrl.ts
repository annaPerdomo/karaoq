export function logoUrl(roomId: string, hash: string): string {
  return `/api/queue/${encodeURIComponent(roomId)}/logo?h=${hash}`;
}
