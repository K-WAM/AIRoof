// Helpers for smoke tests and scenarios: sign in as a seeded account, call the real API over HTTP, simulate a phone call
// through the real ElevenLabs webhooks, read captured emails. Used by e2e/*.spec.ts and scripts/e2e/scenarios/*.
// Import from anywhere: import { api, simulateCall } from "../scripts/e2e/lib.mjs"
const { createHmac, randomUUID } = require("node:crypto");
const { deflateSync } = require("node:zlib");
const { existsSync, readFileSync } = require("node:fs");
const { ACCOUNTS, APP_URL, AUTH_HOST, PASSWORD, PORTS, SECRETS, STATE_FILE, TENANTS, emulatorEnv } = require("./config.cjs");
const { adminApp } = require("./seed.cjs");


const admin = adminApp;
const db = () => adminApp.firestore();

function harnessState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
}

async function assertHarnessUp() {
  try {
    const res = await fetch(`${APP_URL}/api/health`);
    if (res.ok) return;
  } catch {
    /* fall through */
  }
  throw new Error(`The smoke harness is not running at ${APP_URL}. Start it first:  npm run e2e:up   (see docs/SMOKE-HARNESS.md)`);
}

/** Firebase ID token for a seeded account, via the Auth emulator's REST API. */
async function idTokenFor(accountKey) {
  const account = ACCOUNTS[accountKey];
  if (!account) throw new Error(`Unknown account "${accountKey}". Known: ${Object.keys(ACCOUNTS).join(", ")}`);
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: PASSWORD, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Sign-in failed for ${accountKey}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.idToken;
}

/**
 * A small API client authenticated as one seeded account (the same __session cookie the browser sends).
 *   const owner = await api("owner"); const { status, json } = await owner.post("/api/jobs", {...})
 */
async function api(accountKey) {
  const token = await idTokenFor(accountKey);
  const call = async (method, path, body, extraHeaders = {}) => {
    const res = await fetch(`${APP_URL}${path}`, {
      method,
      redirect: "manual",
      headers: { cookie: `__session=${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, ok: res.ok, json, text, headers: res.headers };
  };
  return {
    token,
    accountKey,
    get: (p, h) => call("GET", p, undefined, h),
    post: (p, b, h) => call("POST", p, b ?? {}, h),
    patch: (p, b, h) => call("PATCH", p, b ?? {}, h),
    del: (p, b, h) => call("DELETE", p, b, h),
  };
}

/** Returns the parsed JSON of a 2xx response, or throws with the server's message. */
function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
  return res.json;
}

/**
 * Simulate an inbound ElevenLabs phone call end to end through the REAL webhooks:
 * initiation -> tools (in order) -> signed post-call transcript. Returns ids so a spec can look the call up in the UI.
 *   await simulateCall({ tenant: "roofing", from: "+15551230001",
 *     tools: [["checkAvailability", {...}], ["bookAppointment", {...}]], transcript: [["agent", "..."], ["user", "..."]] })
 */
/**
 * @param {{ tenant?: string, from?: string, tools?: Array<[string, Record<string, unknown>]>, transcript?: Array<[string, string]>, durationSecs?: number, summary?: string }} [options]
 */
async function simulateCall({ tenant = "roofing", from = "+15551230001", tools = [], transcript, durationSecs = 42, summary } = {}) {
  const t = TENANTS[tenant];
  const conversationId = `e2e-conv-${randomUUID().slice(0, 8)}`;
  const toolHeaders = { "content-type": "application/json", "x-luxor-tool-secret": SECRETS.tool };
  const post = async (path, body, headers) => {
    const res = await fetch(`${APP_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, ok: res.ok, json, text };
  };

  const initiation = await post(
    "/api/webhooks/elevenlabs/initiation",
    { caller_id: from, called_number: t.phone, agent_id: t.agentId, conversation_id: conversationId, call_sid: `CA${conversationId}` },
    toolHeaders,
  );
  if (!initiation.ok) throw new Error(`initiation webhook failed: ${initiation.status} ${initiation.text.slice(0, 200)}`);

  const toolResults = [];
  for (const [name, body] of tools) {
    const r = await post(`/api/webhooks/elevenlabs/tools/${name}`, body, { ...toolHeaders, "x-luxor-conversation-id": conversationId });
    toolResults.push({ tool: name, status: r.status, result: r.json });
  }

  const now = Math.floor(Date.now() / 1000);
  const lines = transcript ?? [
    ["agent", `Thanks for calling ${t.name}, how can I help?`],
    ["user", "Hi, I need someone to look at my roof."],
    ["agent", "Happy to help. Let me get some details."],
  ];
  const payload = {
    type: "post_call_transcription",
    event_timestamp: now,
    data: {
      agent_id: t.agentId,
      conversation_id: conversationId,
      transcript: lines.map(([role, message], i) => ({ role, message, time_in_call_secs: i * 5 })),
      metadata: { start_time_unix_secs: now - durationSecs, call_duration_secs: durationSecs },
      analysis: { transcript_summary: summary ?? "Caller asked about a roof inspection." },
    },
  };
  const raw = JSON.stringify(payload);
  const digest = createHmac("sha256", SECRETS.webhook).update(`${now}.${raw}`).digest("hex");
  const postCall = await post("/api/webhooks/elevenlabs/post-call", payload, {
    "content-type": "application/json",
    "elevenlabs-signature": `t=${now},v0=${digest}`,
  });
  if (!postCall.ok) throw new Error(`post-call webhook failed: ${postCall.status} ${postCall.text.slice(0, 200)}`);

  return { businessId: t.id, conversationId, callId: `call_elevenlabs_${conversationId}`, toolResults, from };
}

/** Emails the app "sent" (captured, never delivered). Newest first. */
async function outbox({ to, subject } = {}) {
  const snap = await db().collection("_e2eOutbox").get();
  return snap.docs
    .map((d) => d.data())
    .filter((m) => (!to || m.to === to) && (!subject || String(m.subject).includes(subject)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Read any document/collection straight from the emulator (to assert what the app stored). */
async function readDoc(path) {
  const s = await db().doc(path).get();
  return s.exists ? s.data() : null;
}
async function readCollection(path) {
  const s = await db().collection(path).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** A solid-colour PNG as base64 — enough for photo upload tests without shipping image files. */
function pngBase64(width = 64, height = 48, [r, g, b] = [200, 90, 40]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { admin, db, harnessState, assertHarnessUp, idTokenFor, api, must, simulateCall, outbox, readDoc, readCollection, pngBase64, sleep, ACCOUNTS, APP_URL, TENANTS };
