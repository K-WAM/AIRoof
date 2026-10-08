// Starts the local smoke harness: Firebase Auth + Firestore emulators, the seed, and `next dev` wired to them.
//   npm run e2e:up              foreground (Ctrl+C stops everything)
//   npm run e2e:up -- --detach  start in the background, return when ready (what agents should use)
//   npm run e2e:down            stop it
// Flags: --no-warm (skip pre-compiling pages), --reset (wipe data first; default is to keep data and re-seed accounts)
// No real keys are used or needed; real provider keys in .env.local are blanked for the app process.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, PORTS, PROJECT_ID, ROOT, STATE_DIR, STATE_FILE, appEnv } from "./config.cjs";

const args = new Set(process.argv.slice(2));
const isWin = process.platform === "win32";
const say = (m) => console.log(`[e2e] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function appIsUp() {
  try {
    return (await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {
    return false;
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function waitFor(check, what, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await sleep(700);
  }
  throw new Error(`Timed out waiting for ${what} (${Math.round(timeoutMs / 1000)}s)`);
}

function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (isWin) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGTERM");
  } catch { /* already gone */ }
}

// ---- detach mode: re-run ourselves in the background, wait for ready, return -------------------------------------------
if (args.has("--detach") && !args.has("--child")) {
  if (await appIsUp()) {
    say(`Already running at ${APP_URL}`);
    process.exit(0);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const logPath = join(STATE_DIR, "harness.log");
  const out = openSync(logPath, "w");
  const passthrough = process.argv.slice(2).filter((a) => a !== "--detach");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child", ...passthrough], {
    cwd: ROOT, detached: true, stdio: ["ignore", out, out], windowsHide: true,
  });
  child.unref();
  say(`Starting in the background (log: ${logPath}) ...`);
  const start = Date.now();
  while (Date.now() - start < 6 * 60_000) {
    await sleep(1500);
    const s = readState();
    if (s?.ready) {
      say(`Ready: ${s.urls.app}   (stop with: npm run e2e:down)`);
      process.exit(0);
    }
    if (child.exitCode !== null) break;
  }
  console.error(`[e2e] Did not become ready. Last log lines:\n${existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").slice(-25).join("\n") : "(no log)"}`);
  process.exit(1);
}

// ---- foreground / child ------------------------------------------------------------------------------------------------
if (await appIsUp()) {
  say(`Already running at ${APP_URL}`);
  process.exit(0);
}

const java = spawnSync("java", ["-version"], { stdio: "ignore", shell: isWin });
if (java.status !== 0) {
  console.error("[e2e] Java is required by the Firestore emulator (Java 11+; Temurin 21 works). Install it and re-run.");
  process.exit(1);
}

mkdirSync(STATE_DIR, { recursive: true });
if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);

const pids = {};
const cleanup = () => { killTree(pids.app); killTree(pids.emulators); try { unlinkSync(STATE_FILE); } catch { /* */ } };
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// 1. emulators
writeFileSync(join(STATE_DIR, "firebase.json"), JSON.stringify({
  emulators: {
    auth: { host: "127.0.0.1", port: PORTS.auth },
    firestore: { host: "127.0.0.1", port: PORTS.firestore },
    hub: { host: "127.0.0.1", port: PORTS.hub },
    logging: { host: "127.0.0.1", port: PORTS.logging },
    ui: { enabled: false },
    singleProjectMode: true,
  },
}, null, 2));

if (!(await portOpen(PORTS.firestore))) {
  say(`Starting Firebase emulators (auth :${PORTS.auth}, firestore :${PORTS.firestore}) ...`);
  const emu = spawn("firebase", ["emulators:start", "--only", "auth,firestore", "--project", PROJECT_ID, "--config", "firebase.json"], {
    cwd: STATE_DIR, shell: isWin, stdio: ["ignore", openSync(join(STATE_DIR, "emulators.log"), "w"), openSync(join(STATE_DIR, "emulators.log"), "a")], windowsHide: true,
  });
  pids.emulators = emu.pid;
  emu.on("exit", (code) => { if (code) console.error(`[e2e] emulators exited (${code}); see .e2e/emulators.log`); });
}
await waitFor(async () => (await portOpen(PORTS.firestore)) && (await portOpen(PORTS.auth)), "the Firebase emulators", 120_000);
say("Emulators up.");

// 2. seed (imported after the emulators are listening)
const { seed } = await import("./seed.cjs");
const seeded = await seed({ reset: args.has("--reset") });
say(`Seeded ${seeded.tenants} tenants, ${seeded.accounts} accounts.`);

// 3. the app
// --prod: a real production build + `next start` (into .next-e2e, beside any dev build) — for measuring load times and
// request counts honestly (dev mode double-runs effects under StrictMode and compiles on first visit).
const prod = args.has("--prod");
const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const appLog = openSync(join(STATE_DIR, "app.log"), "w");
const appEnvironment = { ...process.env, ...appEnv(), ...(prod ? { NEXT_DIST_DIR: ".next-e2e", E2E_HARNESS_PROD: "1" } : {}) };
if (prod) {
  say("Building the app for production (--prod) ...");
  const { spawnSync } = await import("node:child_process");
  // `next build` with a custom distDir rewrites tsconfig.json (adds .next-e2e/types); put the checked-in file back.
  const tsconfigPath = join(ROOT, "tsconfig.json");
  const tsconfig = readFileSync(tsconfigPath, "utf8");
  const built = spawnSync(process.execPath, [nextBin, "build"], { cwd: ROOT, env: appEnvironment, stdio: ["ignore", appLog, appLog] });
  writeFileSync(tsconfigPath, tsconfig);
  if (built.status !== 0) { console.error("[e2e] production build failed; see .e2e/app.log"); process.exit(1); }
}
say(`Starting the app on ${APP_URL} (${prod ? "next start" : "next dev"}) ...`);
const app = spawn(process.execPath, [nextBin, prod ? "start" : "dev", "-p", String(PORTS.app)], {
  cwd: ROOT, env: appEnvironment, stdio: ["ignore", appLog, appLog], windowsHide: true,
});
pids.app = app.pid;
app.on("exit", (code) => { if (code) console.error(`[e2e] app exited (${code}); see .e2e/app.log`); });
await waitFor(appIsUp, "the app to answer /api/health", 180_000);

// 4. warm the pages agents will open, so the first browser visit is not a 20 s compile
if (!args.has("--no-warm")) {
  say("Pre-compiling pages (skip with --no-warm) ...");
  const pages = ["/login", "/company/dashboard", "/company/jobs", "/company/jobs/J-1000", "/company/pipeline", "/company/calls", "/company/calendar",
    "/company/library", "/company/customers", "/company/settings", "/company/field", "/hub/demo", "/admin/businesses"];
  for (const p of pages) {
    try { await fetch(`${APP_URL}${p}`, { headers: { cookie: "__session=warmup" }, redirect: "manual", signal: AbortSignal.timeout(120_000) }); } catch { /* keep going */ }
  }
}

writeFileSync(STATE_FILE, JSON.stringify({
  ready: true, startedAt: new Date().toISOString(), pids, ports: PORTS,
  urls: { app: APP_URL, authEmulator: `http://127.0.0.1:${PORTS.auth}`, firestoreEmulator: `http://127.0.0.1:${PORTS.firestore}` },
}, null, 2));
say(`Ready: ${APP_URL}`);
say("Accounts (password E2e-Passw0rd!): owner@roofing.e2e.test, staff@..., crew@..., viewer@... (roofing) · owner@dental.e2e.test · superadmin@e2e.test");
say("Next: npm run e2e:test   or   node scripts/e2e/scenarios/call-to-cash.cjs");

// keep this process alive (it owns the children)
setInterval(() => {}, 1 << 30);
