#!/usr/bin/env node
// One-off operational script — NOT part of the app's runtime.
//
// Reverts the live Vapi assistant's model + voice from OpenAI's
// gpt-realtime-2025-08-28 + "cedar" (T-060, shipped 2026-09-05) back to the
// prior known-good cascaded-pipeline config: gpt-4o-mini + Vapi's own
// "Savannah" voice (v2).
//
// Why: a real phone call test (2026-09-07) found gpt-realtime badly
// regresses turn-taking — the assistant talks over the caller, doesn't yield
// when interrupted, and cuts off mid-word on longer responses (resuming only
// if the caller says "continue"). Root cause: Vapi's stopSpeakingPlan/
// startSpeakingPlan (numWords/backoffSeconds/waitSeconds) govern the
// cascaded transcriber->LLM->TTS pipeline only — they do not apply to
// speech-to-speech models like gpt-realtime, per Vapi's own docs
// (docs.vapi.ai/customization/voice-pipeline-configuration). Those settings
// are still hand-tuned and snappy; this rollback puts them back in charge of
// a pipeline that actually honors them.
//
// Preserves toolIds/messages exactly (Vapi's PATCH replaces the whole
// `model` object, so they're read and resent unchanged) and does not touch
// transcriber/startSpeakingPlan/stopSpeakingPlan/backgroundSound, which were
// never changed by T-060 in the first place.
//
// Usage:
//   VAPI_API_KEY=... node scripts/rollback-vapi-voice.mjs [assistantId] [--dry-run]
// Defaults to the known live assistant (demo-roofing / "Alice") if no id given.
// Writes a full before-snapshot JSON next to this script's cwd for rollback
// (point it at --out <path> to control where; default:
// ./vapi-assistant-backup-<id>-<timestamp>.json, gitignored).

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

  const patchBody = {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      toolIds: current.model?.toolIds,
      messages: current.model?.messages,
    },
    voice: {
      provider: "vapi",
      voiceId: "Savannah",
      version: 2,
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
  console.log(`\nDone. To roll back this rollback: re-PATCH using the saved fields in ${backupFile}.`);
}

main().catch((err) => {
  console.error("Unexpected error — nothing to assume about assistant state:", err);
  process.exit(1);
});
