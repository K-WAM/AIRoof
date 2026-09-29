import { createHash, randomBytes } from "node:crypto";

// The phone-calendar feed link is a bearer secret: 32 random bytes, base64url. Only its sha256 is stored (on the
// member's businessUsers doc as calendarFeedTokenHash), so a database read never yields a working link.

export function newFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token as we issue it: exactly 43 base64url characters. Anything else is refused before any database read. */
export function isFeedTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
