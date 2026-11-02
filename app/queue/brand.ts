import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";
import type { RoomBrand } from "../../pages/api/types";

export type BrandSurface = "host" | "display";

/** Uploads a prepared logo as a 24 h draft. Throws Error("full") when the
 *  server's logo store is out of budget (507), Error("upload") otherwise. */
export async function uploadLogo(
  roomId: string,
  dataUrl: string
): Promise<{ hash: string; url: string }> {
  let resp: Response;
  try {
    resp = await fetch(`/api/queue/${roomId}/logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify({ dataUrl }),
    });
  } catch {
    throw new Error("upload");
  }
  if (resp.status === 403) notifyRoomKeyRejected(roomId);
  if (resp.status === 507) throw new Error("full");
  if (!resp.ok) throw new Error("upload");
  return resp.json();
}

/** Commits the brand (and its draft logo). Throws Error("forbidden") on a
 *  missing or wrong room key, Error("save") on any other failure. */
export async function saveBrand(
  roomId: string,
  brand: RoomBrand,
  surface: BrandSurface
): Promise<RoomBrand> {
  let resp: Response;
  try {
    resp = await fetch(`/api/queue/${roomId}/brand`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify({ brand, surface }),
    });
  } catch {
    throw new Error("save");
  }
  if (resp.status === 403) {
    notifyRoomKeyRejected(roomId);
    throw new Error("forbidden");
  }
  if (!resp.ok) throw new Error("save");
  const body = (await resp.json()) as { brand: RoomBrand };
  return body.brand;
}

export function saveBrandOk(
  roomId: string,
  brand: RoomBrand,
  surface: BrandSurface
): Promise<boolean | "forbidden"> {
  return saveBrand(roomId, brand, surface).then(
    () => true,
    (e: Error) => (e.message === "forbidden" ? "forbidden" : false)
  );
}
