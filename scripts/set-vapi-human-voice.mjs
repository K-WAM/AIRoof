#!/usr/bin/env node
// One-off operational script — NOT part of the app's runtime.
//
// Switches the live Vapi assistant's model + voice to the most natural-
// sounding option currently available on the platform (researched
// 2026-09-05):
//   - model: OpenAI's gpt-realtime-2025-08-28 (native speech-to-speech —
//     no separate STT -> text -> TTS pipeline, so prosody/emotion survive
//     instead of being flattened to text and resynthesized; Vapi's own docs
//     list this as the current production-ready Realtime model)
//   - voice: "cedar" (OpenAI's own recommendation for a warm, conversational
//     tone — the alternative, "marin", is tuned for clarity/structured
//     communication, a worse fit for a friendly receptionist persona)
//
// Deliberately does NOT touch startSpeakingPlan/stopSpeakingPlan/
// backgroundSound — a --dry-run against the real live config (2026-09-05)
// showed these are already hand-tuned (waitSeconds: 0.1, numWords: 2,
// backgroundSound: "office") and snappier than any generic default this
// script could suggest; overwriting them would have been a regression.
// Also corrects two stale doc claims found the same way: the live voice was
// already Vapi's own "Vapi Voices v2" (Savannah), not Cartesia, and the
// transcriber was already Deepgram Flux, not nova-3.
//
// Preserves the assistant's existing tools (toolIds) and system prompt
// (messages) exactly as-is — this script only touches the model/voice
// engine, never the booking logic or persona text. Vapi's PATCH replaces
// the whole `model` object per-request (confirmed by this repo's existing
// updateAssistantPersona()), so this reads the assistant first and resends
// its current toolIds/messages unchanged, same pattern.
//
// Usage:
//   VAPI_API_KEY=... node scripts/set-vapi-human-voice.mjs [assistantId]
// Defaults to the known live assistant (demo-roofing / "Alice") if no id given.
// Writes a full before-snapshot JSON next to this script's cwd for rollback —
// point it at --out <path> to control where, otherwise ./vapi-assistant-backup-<id>.json

const DEFAULT_ASSISTANT_ID = "9267a84a-0f4f-416b-a328-1dc539f5265e";
const VAPI_BASE_URL = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("VAPI_API_KEY is not set in this shell's environment. Aborting — nothing changed.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
  const dryRun = args.includes("--dry-run");
  const assistantId = args.find((a) => !a.startsWith("--") && a !== outPath) ?? DEFAULT_ASSISTANT_ID;

  console.log(`Fetching current config for assistant ${assistantId}...`);
  const getRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    console.error(`GET /assistant failed (${getRes.status}): ${await getRes.text().catch(() => "")}`);
    process.exit(1);
  }
  const current = await getRes.json();

  const before = {
    model: current.model,
    voice: current.voice,
    transcriber: current.transcriber,
    startSpeakingPlan: current.startSpeakingPlan,
    stopSpeakingPlan: current.stopSpeakingPlan,
    backgroundSound: current.backgroundSound,
  };
  console.log("BEFORE:", JSON.stringify(before, null, 2));

  const backupFile = outPath ?? `vapi-assistant-backup-${assistantId}-${Date.now()}.json`;
  const fs = await import("node:fs/promises");
  await fs.writeFile(backupFile, JSON.stringify(current, null, 2), "utf8");
  console.log(`Full pre-change assistant config saved to ${backupFile} (for rollback).`);

  // Model + voice only. The live assistant's startSpeakingPlan (waitSeconds:
  // 0.1), stopSpeakingPlan (numWords: 2), and backgroundSound ("office") are
  // already hand-tuned and snappier than any textbook default this script
  // could suggest — confirmed via a --dry-run against the real config before
  // this was written. Touching them would have been a regression, not an
  // improvement, so they're deliberately left out of this PATCH (omitted
  // fields are left untouched, matching this repo's existing
  // updateAssistantPersona() PATCH semantics).
  const patchBody = {
    model: {
      provider: "openai",
      model: "gpt-realtime-2025-08-28",
      toolIds: current.model?.toolIds,
      messages: current.model?.messages,
    },
    voice: {
      provider: "openai",
      voiceId: "cedar",
    },
  };

  console.log(dryRun ? "Would PATCH with:" : "Applying PATCH with:", JSON.stringify(patchBody, null, 2));
  if (dryRun) {
    console.log("\n--dry-run set: nothing was sent. Re-run without --dry-run to apply.");
    return;
  }
  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(patchBody),
  });
  if (!patchRes.ok) {
    console.error(`PATCH /assistant failed (${patchRes.status}): ${await patchRes.text().catch(() => "")}`);
    console.error("Nothing to roll back — the PATCH itself failed, so the assistant is unchanged.");
    process.exit(1);
  }

  console.log("Verifying the change round-tripped...");
  const verifyRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const after = await verifyRes.json();
  console.log(
    "AFTER:",
    JSON.stringify(
      {
        model: after.model,
        voice: after.voice,
        startSpeakingPlan: after.startSpeakingPlan,
        stopSpeakingPlan: after.stopSpeakingPlan,
        backgroundSound: after.backgroundSound,
      },
      null,
      2,
    ),
  );
  console.log(`\nDone. To roll back: re-PATCH using the saved fields in ${backupFile}.`);
}

main().catch((err) => {
  console.error("Unexpected error — nothing to assume about assistant state:", err);
  process.exit(1);
});
