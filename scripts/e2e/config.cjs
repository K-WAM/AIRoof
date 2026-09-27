// Shared settings for the local smoke harness. See docs/SMOKE-HARNESS.md.
// Everything here is FAKE and local: emulator project id, throwaway secrets, test accounts.
const { createHash } = require("node:crypto");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..", "..");
const STATE_DIR = join(ROOT, ".e2e");
const STATE_FILE = join(STATE_DIR, "state.json");
const PROJECT_ID = "demo-luxor-e2e";

// Ports are derived from the checkout's path, so the main repo and every worktree get their own
// set and can run side by side. Override with E2E_PORT_OFFSET=<multiple of 10> if two collide.
const hashed = parseInt(createHash("sha1").update(ROOT.toLowerCase()).digest("hex").slice(0, 4), 16) % 40;
const PORT_OFFSET = process.env.E2E_PORT_OFFSET !== undefined ? Number(process.env.E2E_PORT_OFFSET) : hashed * 10;
const PORTS = {
  app: 3100 + PORT_OFFSET,
  auth: 9100 + PORT_OFFSET,
  firestore: 8100 + PORT_OFFSET,
  hub: 4400 + PORT_OFFSET,
  logging: 4500 + PORT_OFFSET,
};
const APP_URL = `http://localhost:${PORTS.app}`;
const FIRESTORE_HOST = `127.0.0.1:${PORTS.firestore}`;
const AUTH_HOST = `127.0.0.1:${PORTS.auth}`;

const PASSWORD = "E2e-Passw0rd!";
const SECRETS = { tool: "e2e-tool-secret", webhook: "e2e-webhook-secret", cron: "e2e-cron-secret" };

const TENANTS = {
  roofing: {
    id: "e2e-roofing", name: "E2E Roofing Co", industry: "roofing", phone: "+15550100", agentId: "agent-e2e-roofing",
    contactEmail: "office@e2e-roofing.test", contactPhone: "+1 (555) 010-0100", address: "100 Test Street, Miami, FL 33101", brandColor: "#0f766e",
  },
  // The live demo tenant id — Hub > Demo Studio and superadmin's default view expect it to exist.
  demo: {
    id: "demo-roofing", name: "Apex Roofing (Demo)", industry: "roofing", phone: "+15550300", agentId: "agent-e2e-demo",
    contactEmail: "office@apex-demo.test", contactPhone: "+1 (555) 030-0300", address: "300 Demo Blvd, Miami, FL 33101", brandColor: "#1e3a5f",
  },
  dental: {
    id: "e2e-dental", name: "E2E Dental Care", industry: "dental", phone: "+15550200", agentId: "agent-e2e-dental",
    contactEmail: "front@e2e-dental.test", contactPhone: "+1 (555) 020-0200", address: "200 Smile Ave, Miami, FL 33101", brandColor: "#2563a8",
  },
};

// Every account signs in with PASSWORD. `key` is what specs pass to loginAs("owner").
const ACCOUNTS = {
  superadmin: { uid: "e2e-superadmin", email: "superadmin@e2e.test", superadmin: true },
  owner: { uid: "e2e-owner", email: "owner@roofing.e2e.test", tenant: "roofing", role: "owner", displayName: "Olivia Owner" },
  staff: { uid: "e2e-staff", email: "staff@roofing.e2e.test", tenant: "roofing", role: "staff", displayName: "Sam Staff" },
  crew: { uid: "e2e-crew", email: "crew@roofing.e2e.test", tenant: "roofing", role: "staff", trade: "technician", displayName: "Carlos Crew" },
  viewer: { uid: "e2e-viewer", email: "viewer@roofing.e2e.test", tenant: "roofing", role: "viewer", displayName: "Vera Viewer" },
  dentalOwner: { uid: "e2e-dental-owner", email: "owner@dental.e2e.test", tenant: "dental", role: "owner", displayName: "Dana Dentist" },
};

/** Environment the app process runs with. Real provider keys are BLANKED so nothing can reach a live service. */
function appEnv() {
  const blank = ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "RESEND_API_KEY", "RESEND_FROM", "VAPI_API_KEY", "VAPI_WEBHOOK_SECRET",
    "ELEVENLABS_API_KEY", "STRIPE_SECRET_KEY", "FIREBASE_SERVICE_ACCOUNT_JSON", "VERCEL_OIDC_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"];
  return {
    ...Object.fromEntries(blank.map((k) => [k, ""])),
    E2E_HARNESS: "1",
    FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
    GCLOUD_PROJECT: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-fake-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:e2e",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: `http://${AUTH_HOST}`,
    NEXT_PUBLIC_APP_URL: APP_URL,
    ELEVENLABS_TOOL_SECRET: SECRETS.tool,
    ELEVENLABS_WEBHOOK_SECRET: SECRETS.webhook,
    CRON_SECRET: SECRETS.cron,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/** Env for scripts that use firebase-admin against the emulators. */
function emulatorEnv() {
  return { FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, GCLOUD_PROJECT: PROJECT_ID };
}

module.exports = { ROOT, STATE_DIR, STATE_FILE, PROJECT_ID, PORT_OFFSET, PORTS, APP_URL, FIRESTORE_HOST, AUTH_HOST, PASSWORD, SECRETS, TENANTS, ACCOUNTS, appEnv, emulatorEnv };
