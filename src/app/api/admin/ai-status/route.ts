import { NextRequest, NextResponse } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { isCommsConfigured } from "@/lib/comms/send";

// GET /api/admin/ai-status — "how much is left" for each paid service, so the superadmin tops up BEFORE a feature stops
// (owner, 2026-10-04: "how to keep them charged"). Read-only, superadmin only, cached 5 minutes in memory, and every
// provider call has a 5 s timeout so a slow provider never stalls the page. OpenAI exposes no balance API for a key, so it
// only says whether the key is set and links to its billing page.

export interface ProviderStatus {
  id: "elevenlabs" | "openai" | "deepseek" | "resend" | "twilio";
  name: string;
  usedFor: string;
  state: "ok" | "low" | "empty" | "not_set" | "unknown";
  detail: string;
  topUpUrl: string;
}

let cache: { at: number; providers: ProviderStatus[] } | null = null;
const TTL_MS = 5 * 60_000;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function elevenLabs(): Promise<ProviderStatus> {
  const base = { id: "elevenlabs" as const, name: "ElevenLabs", usedFor: "Phone calls", topUpUrl: "https://elevenlabs.io/app/subscription" };
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ...base, state: "not_set", detail: "No API key set" };
  try {
    const sub = await getJson("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key }) as {
      character_count?: number; character_limit?: number; tier?: string; next_character_count_reset_unix?: number;
    };
    const used = sub.character_count ?? 0;
    const limit = sub.character_limit ?? 0;
    const left = limit > 0 ? Math.max(0, 1 - used / limit) : 1;
    const resets = sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
    return {
      ...base,
      state: limit > 0 && used >= limit ? "empty" : left < 0.15 ? "low" : "ok",
      detail: `${Math.round(left * 100)}% of credits left${sub.tier ? ` · ${sub.tier} plan` : ""}${resets ? ` · resets ${resets}` : ""}`,
    };
  } catch {
    return { ...base, state: "unknown", detail: "Couldn't reach ElevenLabs" };
  }
}

async function deepSeek(): Promise<ProviderStatus> {
  const base = { id: "deepseek" as const, name: "DeepSeek", usedFor: "Call summaries", topUpUrl: "https://platform.deepseek.com/top_up" };
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ...base, state: "not_set", detail: "No API key set — summaries use OpenAI" };
  try {
    const bal = await getJson("https://api.deepseek.com/user/balance", { Authorization: `Bearer ${key}` }) as {
      is_available?: boolean; balance_infos?: Array<{ currency?: string; total_balance?: string }>;
    };
    const info = bal.balance_infos?.[0];
    const amount = Number(info?.total_balance ?? 0);
    return {
      ...base,
      state: bal.is_available === false || amount <= 0 ? "empty" : amount < 2 ? "low" : "ok",
      detail: `${info?.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)} left${bal.is_available === false ? " — summaries are using OpenAI" : ""}`,
    };
  } catch {
    return { ...base, state: "unknown", detail: "Couldn't reach DeepSeek" };
  }
}

function openAi(): ProviderStatus {
  const set = !!process.env.OPENAI_API_KEY;
  return {
    id: "openai", name: "OpenAI", usedFor: "Voice notes, reading notes", topUpUrl: "https://platform.openai.com/settings/organization/billing/overview",
    state: set ? "unknown" : "not_set",
    detail: set ? "Key set · OpenAI shows no balance here — turn on Auto recharge" : "No API key set — voice notes won't work",
  };
}

function resend(): ProviderStatus {
  const set = isCommsConfigured();
  return { id: "resend", name: "Resend", usedFor: "All email", topUpUrl: "https://resend.com/settings/billing", state: set ? "ok" : "not_set", detail: set ? "Key set · monthly plan" : "Not set — no email goes out" };
}

function twilio(): ProviderStatus {
  const set = process.env.SMS_ENABLED === "true" && !!process.env.TWILIO_ACCOUNT_SID;
  return { id: "twilio", name: "Twilio", usedFor: "Texts", topUpUrl: "https://console.twilio.com/us1/billing/manage-billing/billing-overview", state: set ? "ok" : "not_set", detail: set ? "Texting on" : "Off — texts go from the office phone" };
}

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  if (cache && Date.now() - cache.at < TTL_MS && req.nextUrl.searchParams.get("refresh") !== "1") {
    return NextResponse.json({ providers: cache.providers, checkedAt: cache.at }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const [eleven, deep] = await Promise.all([elevenLabs(), deepSeek()]);
  const providers = [eleven, openAi(), deep, resend(), twilio()];
  cache = { at: Date.now(), providers };
  return NextResponse.json({ providers, checkedAt: cache.at }, { headers: { "Cache-Control": "private, no-store" } });
}
