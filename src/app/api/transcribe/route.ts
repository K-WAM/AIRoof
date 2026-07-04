import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// POST /api/transcribe — Whisper transcription only, no save.
// Requires a businessId + field access (session or field key) so the endpoint
// can't be farmed as a free transcription proxy.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { audioBase64, mimeType, businessId } = body;

  if (!audioBase64) return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!openai) return NextResponse.json({ error: "OpenAI not configured" }, { status: 503 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType || "audio/webm" });
    const result = await openai.audio.transcriptions.create({ model: "whisper-1", file: audioFile });
    return NextResponse.json({ transcript: result.text.trim() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Transcription failed" }, { status: 500 });
  }
}
