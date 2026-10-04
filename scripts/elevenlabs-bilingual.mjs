#!/usr/bin/env node
// scripts/elevenlabs-bilingual.mjs — make a live ElevenLabs agent English + Spanish with mid-call switching
// (owner, 2026-10-04: "the AI should handle both Spanish and English all the time … switching mid conversation").
//
// The app already tells the agent, on every call, to speak both (src/lib/i18n/bilingual.ts + the prompt). ElevenLabs
// itself must also allow it, which only the agent's own settings can do:
//   1. a MULTILINGUAL voice model (eleven_flash_v2_5 / eleven_turbo_v2_5 / eleven_multilingual_v2) — the English-only
//      models (eleven_turbo_v2, eleven_flash_v2) cannot say a word of Spanish;
//   2. Spanish listed as an extra language ("language_presets.es");
//   3. the built-in "language_detection" tool, so the agent switches the moment the caller does.
//
// Usage (at the PC with the keys — needs ELEVENLABS_API_KEY in env or .env.local):
//   node scripts/elevenlabs-bilingual.mjs --agent-id agent_xxx            # DRY RUN: shows what is set and what would change
//   node scripts/elevenlabs-bilingual.mjs --agent-id agent_xxx --apply    # writes only the missing pieces
// The agent id is on the client's config page (Admin → Clients → Phone provider → ElevenLabs agent ID).
// ElevenLabs' settings names were taken from their agent API (conversation_config.tts.model_id, language_presets,
// agent.prompt.built_in_tools.language_detection). If ElevenLabs renames them, the dry run prints what it read so you
// can set the same three things in the dashboard: Voice → model, Agent → Additional languages, Tools → Detect language.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MULTILINGUAL = new Set(["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_v3"]);
const UPGRADE = { eleven_turbo_v2: "eleven_turbo_v2_5", eleven_flash_v2: "eleven_flash_v2_5", eleven_monolingual_v1: "eleven_multilingual_v2" };

function loadEnv() {
  const env = { ...process.env };
  const path = join(REPO_ROOT, ".env.local");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return env;
}

const arg = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const apply = process.argv.includes("--apply");
  const agentId = arg("--agent-id")?.trim();
  const apiKey = loadEnv().ELEVENLABS_API_KEY;
  if (!agentId) throw new Error("Pass --agent-id agent_xxx (Admin → Clients → Phone provider).");
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (env or .env.local).");

  const res = await fetch(`${API_BASE}/v1/convai/agents/${encodeURIComponent(agentId)}`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw new Error(`Could not read agent ${agentId}: HTTP ${res.status} ${await res.text()}`);
  const agent = await res.json();
  const cc = agent.conversation_config ?? {};
  const model = cc.tts?.model_id ?? "(not set)";
  const startLang = cc.agent?.language ?? "(not set)";
  const presets = Object.keys(cc.language_presets ?? {});
  const detect = !!cc.agent?.prompt?.built_in_tools?.language_detection;

  console.log(`Agent ${agent.name ?? agentId}`);
  console.log(`  voice model        : ${model} ${MULTILINGUAL.has(model) ? "✓ speaks Spanish" : "✗ English-only or unknown"}`);
  console.log(`  start language     : ${startLang}`);
  console.log(`  extra languages    : ${presets.length ? presets.join(", ") : "(none)"} ${presets.includes("es") ? "✓" : "✗ Spanish missing"}`);
  console.log(`  detect-language    : ${detect ? "✓ on" : "✗ off"}`);

  const patch = { conversation_config: {} };
  if (!MULTILINGUAL.has(model)) patch.conversation_config.tts = { model_id: UPGRADE[model] ?? "eleven_flash_v2_5" };
  if (startLang !== "en") patch.conversation_config.agent = { ...(patch.conversation_config.agent ?? {}), language: "en" };
  if (!presets.includes("es")) patch.conversation_config.language_presets = { ...(cc.language_presets ?? {}), es: { overrides: { agent: { language: "es" } } } };
  if (!detect) {
    patch.conversation_config.agent = {
      ...(patch.conversation_config.agent ?? {}),
      prompt: { built_in_tools: { ...(cc.agent?.prompt?.built_in_tools ?? {}), language_detection: { name: "language_detection", description: "Switch to the language the caller is speaking (English or Spanish).", params: { system_tool_type: "language_detection" } } } },
    };
  }

  if (Object.keys(patch.conversation_config).length === 0) {
    console.log("\nNothing to change — this agent is already English + Spanish with switching. Call it and speak Spanish.");
    return;
  }
  console.log(`\n${apply ? "Applying" : "Would apply"}:\n${JSON.stringify(patch, null, 2)}`);
  if (!apply) { console.log("\nDry run: nothing written. Re-run with --apply."); return; }
  const out = await fetch(`${API_BASE}/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH", headers: { "xi-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(patch),
  });
  if (!out.ok) throw new Error(`ElevenLabs refused the change: HTTP ${out.status} ${await out.text()}\nSet the three items by hand in the dashboard (see the header of this script).`);
  console.log("\nDone. Call the line and speak Spanish, then switch back to English mid-call.");
}

main().catch((error) => { console.error(error.message ?? error); process.exit(1); });
