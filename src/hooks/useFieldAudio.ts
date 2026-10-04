"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { FieldMaterial, FieldLaborEntry, FieldTimelineEvent, ProposedCorrection } from "@/types/jobs";

export type FieldAudioStatus = null | "recording" | "transcribing" | "success" | "error";

export interface FieldAudioResult {
  transcript: string;
  changesSummary: string;
  /** The job the server saved it to, and under whose name — the screen's receipt shows both. */
  jobId?: string;
  submittedBy?: string;
  updatedJob: {
    materials: FieldMaterial[];
    laborEntries: FieldLaborEntry[];
    timelineEvents: FieldTimelineEvent[];
    fieldNotes: string[];
    totalLaborHours: number;
  };
}

interface UseFieldAudioOptions {
  businessId: string | null;
  /** Per-business field key (from the QR link) — authorizes unauthenticated field access. */
  fieldKey?: string;
  submittedBy?: string;
  jobContext?: {
    title?: string;
    address?: string;
    serviceType?: string;
    clientName?: string;
    businessName?: string;
  };
  onSuccess?: (result: FieldAudioResult) => void;
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Re-posts the same in-memory request once when the first upload attempt fails.
 * The body is a reusable JSON string, so the recorded blob is never re-read or
 * discarded between attempts. Nothing is persisted across a page reload.
 */
export async function postFieldAudioWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  fetchImpl: FetchImpl = fetch,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(input, init);
      if (response.ok || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Field audio upload failed");
}

export function useFieldAudio(jobId: string | null, options: UseFieldAudioOptions) {
  const [status, setStatus] = useState<FieldAudioStatus>(null);
  const [transcript, setTranscript] = useState("");
  const [lastResult, setLastResult] = useState<FieldAudioResult | null>(null);
  const [proposedCorrection, setProposedCorrection] = useState<ProposedCorrection | null>(null);
  // The job a pending correction was proposed for. Confirming applies it THERE, even if the screen has since moved
  // to another job — and a job switch drops the card (see the effect below), so it can never land on the wrong job.
  const [proposedFor, setProposedFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    setProposedCorrection(null);
    setProposedFor(null);
    setErrorMessage(null);
  }, [jobId]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("audio/webm");

  // Elapsed-time status text while the server works (upload -> transcribe -> parse/update). The server does not stream
  // its phases, so the wording follows typical timing; it exists so a 6-10 s wait reads as progress, not a hang.
  const [progress, setProgress] = useState<string | null>(null);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopProgress = useCallback(() => {
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
    setProgress(null);
  }, []);
  const startProgress = useCallback(() => {
    progressTimers.current.forEach(clearTimeout);
    setProgress("Uploading…");
    progressTimers.current = [
      setTimeout(() => setProgress("Transcribing…"), 1200),
      setTimeout(() => setProgress("Updating the job…"), 5000),
    ];
  }, []);

  // Apply a correction the user confirmed on the device.
  const confirmCorrection = useCallback(async () => {
    const targetJobId = proposedFor ?? jobId;
    if (!proposedCorrection || !targetJobId) return;
    setStatus("transcribing");
    setErrorMessage(null);
    startProgress();
    try {
      const res = await fetch(`/api/jobs/${targetJobId}/field-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.fieldKey ? { "x-field-key": options.fieldKey } : {}),
        },
        body: JSON.stringify({ businessId: options.businessId, submittedBy: options.submittedBy, confirmCorrection: proposedCorrection }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProposedCorrection(null);
        setProposedFor(null);
        setStatus("success");
        options.onSuccess?.({ transcript: "", changesSummary: "Correction applied", updatedJob: data.updatedJob, jobId: data.jobId ?? targetJobId, submittedBy: data.submittedBy });
      } else {
        setErrorMessage(typeof data.error === "string" ? data.error : null);
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      stopProgress();
      setTimeout(() => setStatus(null), 2500);
    }
  }, [proposedCorrection, proposedFor, jobId, options, startProgress, stopProgress]);

  const cancelCorrection = useCallback(() => { setProposedCorrection(null); setProposedFor(null); }, []);

  const startRecording = useCallback(async (e?: React.PointerEvent) => {
    e?.preventDefault();
    if (!jobId || status === "transcribing") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick the best supported format — iOS only supports audio/mp4
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.start();
      setErrorMessage(null);
      setStatus("recording");
    } catch {
      setErrorMessage("The microphone is blocked. Allow it in your browser settings, or type the note instead.");
      setStatus("error");
      setTimeout(() => setStatus(null), 3000);
    }
  }, [jobId, status]);

  const stopRecording = useCallback(async (e?: React.PointerEvent) => {
    e?.preventDefault();
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        // Ignore if recording was too short (accidental tap)
        if (blob.size < 500) {
          setStatus(null);
          resolve();
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          setStatus("transcribing");
          setErrorMessage(null);
          startProgress();

          try {
            const requestBody = JSON.stringify({
              businessId: options.businessId,
              audioBase64: base64,
              mimeType: mimeTypeRef.current,
              submittedBy: options.submittedBy,
              jobContext: options.jobContext,
            });
            const res = await postFieldAudioWithRetry(`/api/jobs/${jobId}/field-audio`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(options.fieldKey ? { "x-field-key": options.fieldKey } : {}),
              },
              body: requestBody,
            });

            const data = await res.json();
            if (res.ok && data.proposedCorrection) {
              // Correction detected — surface a one-tap confirm card; don't apply yet.
              setTranscript(data.transcript || "");
              setProposedCorrection(data.proposedCorrection);
              setProposedFor(jobId);
              setStatus(null);
            } else if (res.ok && data.success) {
              setTranscript(data.transcript || "");
              setLastResult(data);
              setStatus("success");
              options.onSuccess?.({ ...data, jobId: data.jobId ?? jobId ?? undefined });
            } else {
              setErrorMessage(typeof data.error === "string" ? data.error : res.ok ? "No speech heard — hold the button while you talk." : null);
              setStatus("error");
            }
          } catch {
            setStatus("error");
          } finally {
            stopProgress();
            setTimeout(() => setStatus(null), 3000);
            resolve();
          }
        };
      };

      recorder.stop();
    });
  }, [jobId, options, startProgress, stopProgress]);

  return { status, progress, transcript, lastResult, proposedCorrection, proposedFor, errorMessage, confirmCorrection, cancelCorrection, startRecording, stopRecording };
}
