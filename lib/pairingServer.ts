import { createHash, randomBytes, randomInt } from "crypto";

export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newPairSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function hashPairSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
