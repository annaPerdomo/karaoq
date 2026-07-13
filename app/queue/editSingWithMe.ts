export interface SingWithMeEdit {
  songTitle: string;
  videoId: string;
  minSingers: number;
  maxSingers: number;
  /** Supplied when the poster edits their own post (enforced server-side);
   *  omitted for host moderation, which can edit any post. */
  userName?: string;
}

export default async function editSingWithMe(
  roomId: string,
  postId: string,
  edit: SingWithMeEdit
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/sing-with-me-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, ...edit }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
