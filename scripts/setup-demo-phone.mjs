
// Targeted public-demo provisioning. Default is a sanitized dry-run; never prints credentials.
import { readFileSync } from "node:fs";

import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { serviceAccount } from "./lib/adminCredential.mjs";
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw Error("Existing ElevenLabs credential unavailable");
const app = initializeApp({ credential: cert(serviceAccount()) });
async function api(path, body, method = body ? "POST" : "GET") {
 const response = await fetch("https://api.elevenlabs.io/v1/convai/" + path, { method, headers: { "xi-api-key": key, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
 if (!response.ok) throw Error(`Provider ${method} ${path.split('?')[0]} returned ${response.status}`);
 return response.json();
}
try {
 const business = (await getFirestore(app).doc("businesses/demo-roofing").get()).data();
 if (business?.isDemo !== true || !business.elevenlabs?.agentId) throw Error("Marked public demo missing");
 const agentId = business.elevenlabs.agentId;
 const agent = await api(`agents/${agentId}`);
 const ids = agent.conversation_config.agent.prompt.tool_ids;
 const tools = await Promise.all(ids.map(id => api(`tools/${id}`)));
 let existing = tools.find(t => t.tool_config.name === "connectDemoSession");
 const template = tools.find(t => t.tool_config.name === "bookAppointment")?.tool_config;
 if (!template?.api_schema?.request_headers?.['x-luxor-tool-secret']?.secret_id) throw Error("Expected existing tool authentication missing");
 const schema = JSON.parse(readFileSync("src/lib/voice/elevenlabs/toolSchemas.json", "utf8")).find(t => t.name === "connectDemoSession");
 const base = new URL(template.api_schema.url).origin;
 if (base !== "https://ai-roof.vercel.app" && base !== "https://crm.luxordev.com") throw Error("Unexpected existing demo tool origin");
 const tool = { type: "webhook", name: schema.name, description: schema.description, pre_tool_speech: "auto", force_pre_tool_speech: false, response_timeout_secs: 30,
  api_schema: { url: base + schema.path, method: "POST", request_headers: template.api_schema.request_headers, request_body_schema: schema.parameters } };
 // Reuse an exact orphan from an interrupted setup instead of creating duplicates.
 if (!existing) {
  let cursor;
  do {
   const page = await api(`tools?page_size=100&types=webhook${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
   existing = page.tools?.find(t => t.tool_config?.name === schema.name && t.tool_config.api_schema?.url === tool.api_schema.url);
   cursor = page.next_cursor;
  } while (!existing && cursor);
 }
 if (existing && (existing.tool_config.api_schema?.url !== tool.api_schema.url || JSON.stringify(existing.tool_config.api_schema?.request_headers) !== JSON.stringify(tool.api_schema.request_headers))) throw Error("Existing phone tool differs; inspect it before applying");
 const plan = { agentId, addTool: !existing, existingToolsPreserved: ids.length, toolUrl: tool.api_schema.url, maxSeconds: { before: agent.conversation_config.conversation.max_duration_seconds, after: 180 }, secrets: "reuse existing references", voiceAndPhoneBindings: "unchanged" };
 console.log(JSON.stringify(plan));
 if (process.argv.includes("--apply")) {
   if (!existing) {
    const created = await api("tools", { tool_config: tool });
    const id = created.id || created.tool_id; if (!id) throw Error("Provider tool ID missing");
    ids.push(id);
   }
   if (existing && !ids.includes(existing.id)) ids.push(existing.id);
   // PATCH only the requested fields. Preserve the provider's explicit built-in system-tool map.
   const prompt = { tool_ids: ids, built_in_tools: agent.conversation_config.agent.prompt.built_in_tools };
   await api(`agents/${agentId}`, { conversation_config: { conversation: { max_duration_seconds: 180 }, agent: { prompt } } }, "PATCH");
   const after = await api(`agents/${agentId}`);
   if (after.conversation_config.conversation.max_duration_seconds !== 180 || after.conversation_config.agent.prompt.tool_ids.length !== ids.length) throw Error("Provider readback mismatch");

   const oldNames = agent.conversation_config.agent.prompt.tools.map(t => t.name);
   const newNames = new Set(after.conversation_config.agent.prompt.tools.map(t => t.name));
   if (!oldNames.every(name => newNames.has(name)) || !newNames.has("connectDemoSession") || JSON.stringify(after.conversation_config.agent.prompt.built_in_tools) !== JSON.stringify(agent.conversation_config.agent.prompt.built_in_tools) || JSON.stringify(after.conversation_config.tts) !== JSON.stringify(agent.conversation_config.tts) || JSON.stringify(after.platform_settings) !== JSON.stringify(agent.platform_settings)) throw Error("Agent readback differs outside the intended change; inspect provider settings");
   console.log(JSON.stringify({ agentId, maxSeconds: 180, toolCount: ids.length, at: new Date().toISOString() }));
   console.log("Public demo agent configuration verified.");
 }
} finally { await deleteApp(app); }
