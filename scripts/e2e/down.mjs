// Stops the smoke harness started by up.mjs (app + emulators). Safe to run when nothing is running.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { STATE_FILE } from "./config.cjs";

const isWin = process.platform === "win32";
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;

function kill(pid) {
  if (!pid) return;
  try {
    if (isWin) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGTERM");
  } catch { /* already gone */ }
}

if (!state) {
  console.log("[e2e] Nothing recorded as running for this checkout.");
} else {
  kill(state.pids?.app);
  kill(state.pids?.emulators);
  try { unlinkSync(STATE_FILE); } catch { /* */ }
  console.log("[e2e] Stopped.");
}
