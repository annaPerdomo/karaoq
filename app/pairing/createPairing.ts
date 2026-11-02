export interface CreatedPairing {
  code: string;
  secret: string;
  expiresAt: number;
}

export async function createPairing(): Promise<CreatedPairing | null> {
  try {
    const resp = await fetch("/api/tv-pair", { method: "POST" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<CreatedPairing>;
    if (
      typeof data.code !== "string" ||
      typeof data.secret !== "string" ||
      typeof data.expiresAt !== "number"
    ) {
      return null;
    }
    return { code: data.code, secret: data.secret, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}
