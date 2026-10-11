import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// GET /api/luxor-usage — ElevenLabs credit numbers for the owner's Luxor Tools dashboard (tools.luxordev.com → My Apps).
// The ElevenLabs key stays here; Luxor Tools only ever sees the numbers. Server-to-server only: requires
// "Authorization: Bearer <LUXOR_USAGE_TOKEN>", a secret set in both Vercel projects. Read-only, 5 s timeout.

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.LUXOR_USAGE_TOKEN;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ elevenlabs: { configured: false } }, { headers: { "Cache-Control": "no-store" } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ elevenlabs: { configured: true, error: `HTTP ${res.status}` } }, { headers: { "Cache-Control": "no-store" } });
    const sub = (await res.json()) as { character_count?: number; character_limit?: number; tier?: string; next_character_count_reset_unix?: number };
    return NextResponse.json({
      elevenlabs: {
        configured: true,
        used: sub.character_count ?? 0,
        limit: sub.character_limit ?? 0,
        plan: sub.tier ?? null,
        resetsAt: sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toISOString() : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ elevenlabs: { configured: true, error: "unreachable" } }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
