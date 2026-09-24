// Single source of truth for the 7 ElevenLabs webhook-tool definitions (T-111b).
//
// The canonical JSON lives in toolSchemas.json next to this file so the plain-ESM
// provisioning script (scripts/setup-elevenlabs-agent.mjs) reads the SAME
// names/descriptions/parameter schemas without a TypeScript runtime. This module
// is the typed view used by tests and by anything that needs the schema shape.
//
// Field names re-verified against https://elevenlabs.io/docs/eleven-agents
// (2026-09-24):
//   - POST https://api.elevenlabs.io/v1/convai/tools with
//     { tool_config: { type: "webhook", name, description,
//       api_schema: { url, method, request_headers, request_body_schema } } }
//   - request_headers values are string | { secret_id } | { variable_name } |
//     { env_var_label } — a secret locator and a dynamic-variable locator are
//     exactly how the tools authenticate AND how the per-call conversation id
//     reaches the webhook without ever being a model-visible parameter.
//
// NO businessId / callId / verifiedCallerPhone parameters exist in any schema —
// the tools route resolves all of those server-side from the stored
// elevenlabsConversations record, never from the model.

import rawSchemas from "./toolSchemas.json";
import { getAppUrl } from "@/lib/config/appUrl";

export const ELEVENLABS_TOOL_SECRET_HEADER = "x-luxor-tool-secret";
export const ELEVENLABS_CONVERSATION_ID_HEADER = "x-luxor-conversation-id";
export const ELEVENLABS_CONVERSATION_ID_VARIABLE = "system__conversation_id";
export const ELEVENLABS_TOOL_RESPONSE_TIMEOUT_SECS = 30;

export const ELEVENLABS_TOOL_NAMES = [
  "bookAppointment",
  "checkAvailability",
  "createLead",
  "escalateCall",
  "lookupAppointment",
  "cancelAppointment",
  "getCurrentDate",
] as const;

export type ElevenLabsToolName = (typeof ELEVENLABS_TOOL_NAMES)[number];

export function isElevenLabsToolName(value: string): value is ElevenLabsToolName {
  return (ELEVENLABS_TOOL_NAMES as readonly string[]).includes(value);
}

export interface ElevenLabsToolParameterSchema {
  type: "string" | "integer" | "boolean" | "object";
  description: string;
  enum?: string[];
}

export interface ElevenLabsToolBodySchema {
  type: "object";
  properties: Record<string, ElevenLabsToolParameterSchema>;
  required?: string[];
}

export interface ElevenLabsToolDefinition {
  name: string;
  description: string;
  /** Relative route path, e.g. "/api/webhooks/elevenlabs/tools/bookAppointment". */
  path: string;
  method: "POST";
  bodySchema: ElevenLabsToolBodySchema;
}

/** `tool_config` payload for the POST /v1/convai/tools API. */
export interface ElevenLabsWebhookToolConfig {
  tool_config: {
    type: "webhook";
    name: string;
    description: string;
    response_timeout_secs: number;
    api_schema: {
      url: string;
      method: "POST";
      request_headers: {
        [ELEVENLABS_TOOL_SECRET_HEADER]: { secret_id: string };
        [ELEVENLABS_CONVERSATION_ID_HEADER]: { variable_name: string };
      };
      request_body_schema: ElevenLabsToolBodySchema;
    };
  };
}

interface RawToolSchema {
  name: string;
  description: string;
  method: string;
  path: string;
  parameters: ElevenLabsToolBodySchema;
}

const RAW_SCHEMAS = rawSchemas as unknown as RawToolSchema[];

/** The 7 relative tool definitions. */
export function elevenLabsToolDefinitions(): ElevenLabsToolDefinition[] {
  return RAW_SCHEMAS.map((raw) => ({
    name: raw.name,
    description: raw.description,
    path: raw.path,
    method: "POST",
    bodySchema: raw.parameters,
  }));
}

export function elevenLabsToolDefinition(name: string): ElevenLabsToolDefinition | undefined {
  return elevenLabsToolDefinitions().find((tool) => tool.name === name);
}

/**
 * Build the exact `tool_config` the ElevenLabs tools API expects for one tool.
 * `toolSecretId` is the workspace secret holding ELEVENLABS_TOOL_SECRET — the
 * provisioning script creates/reuses it (see scripts/setup-elevenlabs-agent.mjs
 * and docs/ELEVENLABS-SETUP.md).
 */
export function elevenLabsToolConfig(
  name: string,
  options: { baseUrl?: string; toolSecretId: string }
): ElevenLabsWebhookToolConfig | undefined {
  const definition = elevenLabsToolDefinitions().find(
    (tool) => tool.name === name
  );
  if (!definition) return undefined;
  const base = (options.baseUrl ?? getAppUrl()).replace(/\/+$/, "");
  return {
    tool_config: {
      type: "webhook",
      name: definition.name,
      description: definition.description,
      response_timeout_secs: ELEVENLABS_TOOL_RESPONSE_TIMEOUT_SECS,
      api_schema: {
        url: `${base}${definition.path}`,
        method: "POST",
        request_headers: {
          [ELEVENLABS_TOOL_SECRET_HEADER]: { secret_id: options.toolSecretId },
          [ELEVENLABS_CONVERSATION_ID_HEADER]: {
            variable_name: ELEVENLABS_CONVERSATION_ID_VARIABLE,
          },
        },
        request_body_schema: definition.bodySchema,
      },
    },
  };
}
