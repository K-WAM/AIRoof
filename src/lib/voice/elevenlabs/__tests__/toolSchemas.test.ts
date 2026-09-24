import { describe, expect, it } from "vitest";
import {
  ELEVENLABS_CONVERSATION_ID_HEADER,
  ELEVENLABS_CONVERSATION_ID_VARIABLE,
  ELEVENLABS_TOOL_NAMES,
  ELEVENLABS_TOOL_SECRET_HEADER,
  elevenLabsToolConfig,
  elevenLabsToolDefinitions,
} from "@/lib/voice/elevenlabs/toolSchemas";

const PRIVILEGED_PARAMS = ["businessId", "callId", "verifiedCallerPhone"];

describe("elevenLabsToolDefinitions (single source of truth)", () => {
  it("defines exactly the 7 tools the dispatcher supports", () => {
    const names = elevenLabsToolDefinitions().map((tool) => tool.name);
    expect(names.sort()).toEqual([...ELEVENLABS_TOOL_NAMES].sort());
    expect(names).toHaveLength(7);
  });

  it("every tool is a POST to the elevenlabs tools route", () => {
    for (const tool of elevenLabsToolDefinitions("https://example.com")) {
      expect(tool.method).toBe("POST");
      expect(tool.path).toBe(`/api/webhooks/elevenlabs/tools/${tool.name}`);
    }
  });

  it("exposes NO privileged parameters to the model", () => {
    for (const tool of elevenLabsToolDefinitions()) {
      const properties = Object.keys(tool.bodySchema.properties);
      const required = tool.bodySchema.required ?? [];
      for (const privileged of PRIVILEGED_PARAMS) {
        expect(properties).not.toContain(privileged);
        expect(required).not.toContain(privileged);
      }
    }
  });

  it("every exposed parameter has a description for the LLM", () => {
    for (const tool of elevenLabsToolDefinitions()) {
      for (const property of Object.values(tool.bodySchema.properties)) {
        expect(property.description.length).toBeGreaterThan(10);
      }
    }
  });

  it("cancelAppointment mirrors the Vapi schema: confirmCancellation + appointmentNumber", () => {
    const cancel = elevenLabsToolDefinitions().find((tool) => tool.name === "cancelAppointment");
    expect(cancel).toBeDefined();
    expect(cancel?.bodySchema.properties.confirmCancellation?.type).toBe("boolean");
    expect(cancel?.bodySchema.properties.appointmentNumber?.type).toBe("integer");
  });

  it("getCurrentDate takes no parameters", () => {
    const date = elevenLabsToolDefinitions().find((tool) => tool.name === "getCurrentDate");
    expect(date?.bodySchema.properties).toEqual({});
  });
});

describe("elevenLabsToolConfig (tools API payload)", () => {
  it("builds the full tool_config with secret + conversation-id headers", () => {
    const config = elevenLabsToolConfig("bookAppointment", {
      baseUrl: "https://example.com/",
      toolSecretId: "sec_123",
    });
    expect(config).toBeDefined();
    const schema = config!.tool_config.api_schema;
    expect(schema.url).toBe("https://example.com/api/webhooks/elevenlabs/tools/bookAppointment");
    expect(schema.method).toBe("POST");
    expect(schema.request_headers).toEqual({
      [ELEVENLABS_TOOL_SECRET_HEADER]: { secret_id: "sec_123" },
      [ELEVENLABS_CONVERSATION_ID_HEADER]: { variable_name: ELEVENLABS_CONVERSATION_ID_VARIABLE },
    });
    expect(schema.request_body_schema.properties).not.toHaveProperty("businessId");
    expect(schema.response_timeout_secs).toBeGreaterThanOrEqual(20);
  });

  it("returns undefined for an unknown tool name", () => {
    expect(
      elevenLabsToolConfig("notATool", { toolSecretId: "sec_123" })
    ).toBeUndefined();
  });
});
