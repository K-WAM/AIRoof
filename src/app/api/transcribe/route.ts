import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { isProviderReady } from "@/lib/ai/registry";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["audio/", "video/"];
const TRANSCRIBE_TIMEOUT_MS = 30_000;

function validateAudioInput(audioBase64: string, mimeType?: string): { error?: string } {
  if (!audioBase64 || audioBase64.length === 0) {
    return { error: "audioBase64 is empty" };
  }

  const decodedLen = Math.floor((audioBase64.length * 3) / 4);
  if (decodedLen > MAX_AUDIO_BYTES) {
    return { error: `Audio exceeds maximum size of ${MAX_AUDIO_BYTES / (1024 * 1024)}MB` };
  }

  if (mimeType && !ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return { error: `Unsupported MIME type: ${mimeType}` };
  }

  return {};
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { audioBase64, mimeType, businessId } = body;

  if (!audioBase64) return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const audioCheck = validateAudioInput(audioBase64, mimeType);
  if (audioCheck.error) return NextResponse.json({ error: audioCheck.error }, { status: 400 });

  const openaiReady = isProviderReady("openai");
  if (!openaiReady) {
    return NextResponse.json(
      { error: "OpenAI provider not configured — transcription unavailable" },
      { status: 503 },
    );
  }

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType || "audio/webm" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    const result = await openai.audio.transcriptions.create(
      { model: "whisper-1", file: audioFile },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const transcript = result.text.trim();
    if (!transcript || transcript.length < 2) {
      return NextResponse.json({ transcript: "", empty: true });
    }

    return NextResponse.json({ transcript });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Transcription timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 },
    );
  }
}
