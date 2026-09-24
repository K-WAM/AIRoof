#!/usr/bin/env node
// scripts/setup-elevenlabs-agent.mjs (T-111b)
//
// Idempotent provisioning for the ElevenLabs side of the phone line:
//   1. a workspace secret holding ELEVENLABS_TOOL_SECRET (the tools + initiation
//      webhook authenticate with it),
//   2. the 7 webhook tools — definitions read from
//      src/lib/voice/elevenlabs/toolSchemas.json (the single source of truth,
//      shared with toolSchemas.ts),
//   3. a test agent ("Luxor AI Receptionist (test)") with conversation-initiation
//      webhook overrides enabled.
//
// Usage:
//   node scripts/setup-elevenlabs-agent.mjs            # DRY RUN (default)
//   node scripts/setup-elevenlabs-agent.mjs --apply    # actually create
//
// Reads ELEVENLABS_API_KEY / ELEVENLABS_TOOL_SECRET / NEXT_PUBLIC_APP_URL from
// the environment first, then from .env.local. Idempotent by name: existing
// tools/secrets/agents are reused, never duplicated. A dry run makes ZERO
// network calls. Dashboard-only steps (workspace post-call webhook URL + secret,
// agent Security tab) are documented in docs/ELEVENLABS-SETUP.md.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";

// Keep these in sync with src/lib/voice/elevenlabs/toolSchemas.ts.
const TOOL_SECRET_HEADER = "x-luxor-tool-secret";
const CONVERSATION_ID_HEADER = "x-luxor-conversation-id";
const CONVERSATION_ID_VARIABLE = "system__conversation_id";
const TOOL_RESPONSE_TIMEOUT_SECS = 30;

const TOOL_SECRET_NAME = "LUXOR_TOOL_SECRET";
const TEST_AGENT_NAME = "Luxor AI Receptionist (test)";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const SCHEMAS_PATH = join(REPO_ROOT, "src", "lib", "voice", "elevenlabs", "toolSchemas.json");

function loadEnv() {
  const env = { ...process.env };
  const envPath = process.env.ELEVENLABS_ENV_FILE ?? join(REPO_ROOT, ".env.local");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(match[1] in env)) env[match[1]] = value;
    }
  }
  return env;
}

async function apiFetch(apiKey, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `ElevenLabs API ${options.method ?? "GET"} ${path} -> ${response.status}`
    );
  }
  return response.json();
}

async function listAllTools(apiKey) {
  const tools = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ page_size: "100", types: "webhook" });
    if (cursor) qs.set("cursor", cursor);
    const page = await apiFetch(apiKey, `/v1/convai/tools?${qs.toString()}`);
    for (const tool of page.tools ?? []) {
      tools.push({ id: tool.id, name: tool.tool_config?.name });
    }
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return tools;
}

async function listAllSecrets(apiKey) {
  const secrets = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await apiFetch(apiKey, `/v1/convai/secrets?${qs.toString()}`);
    for (const secret of page.secrets ?? []) {
      secrets.push({ id: secret.secret_id ?? secret.id, name: secret.name });
    }
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return secrets;
}

async function listAllAgents(apiKey) {
  const agents = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await apiFetch(apiKey, `/v1/convai/agents?${qs.toString()}`);
    for (const agent of page.agents ?? []) {
      agents.push({ id: agent.agent_id ?? agent.id, name: agent.name });
    }
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return agents;
}

function buildToolConfig(schema, baseUrl, toolSecretId) {
  return {
    tool_config: {
      type: "webhook",
      name: schema.name,
      description: schema.description,
      response_timeout_secs: TOOL_RESPONSE_TIMEOUT_SECS,
      api_schema: {
        url: `${baseUrl}${schema.path}`,
        method: "POST",
        request_headers: {
          [TOOL_SECRET_HEADER]: { secret_id: toolSecretId },
          [CONVERSATION_ID_HEADER]: { variable_name: CONVERSATION_ID_VARIABLE },
        },
        request_body_schema: schema.parameters,
      },
    },
  };
}

function buildTestAgentConfig(toolIds) {
  return {
    name: TEST_AGENT_NAME,
    conversation_config: {
      agent: {
        prompt: {
          prompt:
            "You are a test AI receptionist for the Luxor AI platform. The live per-call prompt, greeting, language and voice are supplied by the conversation initiation webhook; the per-call tool traffic is authenticated server-side. Keep responses short, natural and phone-friendly.",
          tool_ids: toolIds,
        },
        first_message: "This is a test line for the Luxor AI platform. How can I help?",
        language: "en",
      },
    },
    platform_settings: {
      overrides: {
        enable_conversation_initiation_client_data_from_webhook: true,
        conversation_config_override: {
          agent: { first_message: true, language: true, prompt: { prompt: true } },
          tts: { voice_id: true },
        },
      },
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = loadEnv();
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const toolSecret = env.ELEVENLABS_TOOL_SECRET?.trim();
  const baseUrl = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");

  const schemas = JSON.parse(readFileSync(SCHEMAS_PATH, "utf8"));

  console.log(apply ? "=== ElevenLabs provisioning (APPLY) ===" : "=== ElevenLabs provisioning (DRY RUN — no writes) ===");
  console.log(`App base URL : ${baseUrl}`);
  console.log(`Tool secret  : ${toolSecret ? "configured" : "missing"}`);
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set (env or .env.local). Nothing to do.");
    process.exit(1);
  }
  if (!baseUrl || !/^https:\/\/[^/]+/i.test(baseUrl)) {
    console.error("NEXT_PUBLIC_APP_URL must be a public HTTPS base URL. Nothing to do.");
    process.exit(1);
  }
  if (!apply) {
    console.log("\nThe following would be created or reused (pass --apply to write):");
  }

  const plan = [];
  const results = { tools: [], secret: null, agent: null };

  if (!apply) {
    for (const schema of schemas) {
      plan.push(`tool ${schema.name} -> ${baseUrl}${schema.path}`);
    }
    plan.push(`workspace secret ${TOOL_SECRET_NAME} (holds ELEVENLABS_TOOL_SECRET)`);
    plan.push(`agent "${TEST_AGENT_NAME}" with conversation-initiation overrides enabled`);
    for (const line of plan) console.log(`  [plan] ${line}`);
    console.log("\nDry run made no writes and no network calls. Re-run with --apply to create.");
    return;
  }

  if (!toolSecret) {
    console.error(
      "ELEVENLABS_TOOL_SECRET is required for --apply (the tools authenticate with it). Set it in env or .env.local."
    );
    process.exit(1);
  }

  console.log("\n[1/3] Workspace secret");
  const secrets = await listAllSecrets(apiKey);
  let secret = secrets.find((entry) => entry.name === TOOL_SECRET_NAME) ?? null;
  if (secret) {
    console.log(`  reuse existing secret "${TOOL_SECRET_NAME}" (id ${secret.id})`);
    console.log("  NOTE: secret values cannot be read back — if ELEVENLABS_TOOL_SECRET changed,");
    console.log("  delete the old secret in the ElevenLabs dashboard and re-run this script.");
  } else {
    const created = await apiFetch(apiKey, "/v1/convai/secrets", {
      method: "POST",
      body: JSON.stringify({ name: TOOL_SECRET_NAME, value: toolSecret, type: "new" }),
    });
    secret = { id: created.secret_id ?? created.id, name: TOOL_SECRET_NAME };
    console.log(`  created secret "${TOOL_SECRET_NAME}" (id ${secret.id})`);
  }
  results.secret = secret.id;

  console.log("\n[2/3] Tools");
  const tools = await listAllTools(apiKey);
  const toolIds = [];
  for (const schema of schemas) {
    const existing = tools.find((tool) => tool.name === schema.name);
    if (existing) {
      console.log(`  reuse tool ${schema.name} (id ${existing.id})`);
      toolIds.push(existing.id);
      results.tools.push({ name: schema.name, id: existing.id, created: false });
    } else {
      const created = await apiFetch(apiKey, "/v1/convai/tools", {
        method: "POST",
        body: JSON.stringify(buildToolConfig(schema, baseUrl, secret.id)),
      });
      const toolId = created.id;
      console.log(`  created tool ${schema.name} (id ${toolId}) -> ${baseUrl}${schema.path}`);
      toolIds.push(toolId);
      results.tools.push({ name: schema.name, id: toolId, created: true });
    }
  }

  console.log("\n[3/3] Test agent");
  const agents = await listAllAgents(apiKey);
  const existingAgent = agents.find((agent) => agent.name === TEST_AGENT_NAME) ?? null;
  if (existingAgent) {
    console.log(`  reuse agent "${TEST_AGENT_NAME}" (id ${existingAgent.id})`);
    console.log("  NOTE: re-run does not reattach tools — attach them in the dashboard (Tools tab)");
    console.log("  if this agent was created by an earlier partial run.");
    results.agent = { id: existingAgent.id, created: false };
  } else {
    const created = await apiFetch(apiKey, "/v1/convai/agents/create", {
      method: "POST",
      body: JSON.stringify(buildTestAgentConfig(toolIds)),
    });
    const agentId = created.agent_id ?? created.id;
    console.log(`  created agent "${TEST_AGENT_NAME}" (id ${agentId})`);
    results.agent = { id: agentId, created: true };
  }

  console.log("\n=== Provisioned ids ===");
  console.log(`secret (${TOOL_SECRET_NAME}): ${results.secret}`);
  for (const tool of results.tools) {
    console.log(`tool ${tool.name}: ${tool.id}${tool.created ? " (created)" : " (existing)"}`);
  }
  console.log(`agent ("${TEST_AGENT_NAME}"): ${results.agent.id}${results.agent.created ? " (created)" : " (existing)"}`);
  console.log("\nRemaining dashboard-only steps: docs/ELEVENLABS-SETUP.md");
}

main().catch((error) => {
  console.error("setup-elevenlabs-agent failed:", error.message);
  process.exit(1);
});
