import type { NextRequest } from "next/server";
import { jsonWithCache } from "@/lib/http/cache";
import { OnboardingError } from "./store";
import { z } from "zod";

export async function readBody(request: NextRequest) {
  // Stream the body with a real byte limit; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new OnboardingError("Enter your answers before saving.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) { await reader.cancel(); throw new OnboardingError("This form is too large. Shorten your answers and try again.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new OnboardingError("We couldn't read those answers. Try saving again."); }
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new OnboardingError("Open this form from your client portal.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new OnboardingError("Open this form from your client portal.", 403);
}
export function routeError(error: unknown) {
  const status = error instanceof OnboardingError ? error.status : error instanceof z.ZodError ? 400 : 500;
  return jsonWithCache({ error: error instanceof OnboardingError ? error.message : status === 400 ? "Check the entries and their lengths before saving." : "We couldn't load your portal. Try again shortly." }, "noStore", { status, headers: { "Referrer-Policy": "no-referrer" } });
}
