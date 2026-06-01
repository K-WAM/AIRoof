"use client";

import { useState, useRef, useCallback } from "react";
import type { FieldMaterial, FieldLaborEntry, FieldTimelineEvent, ProposedCorrection } from "@/types/jobs";

export type FieldAudioStatus = null | "recording" | "transcribing" | "success" | "error";

export interface FieldAudioResult {
  transcript: string;
  changesSummary: string;
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

export function useFieldAudio(jobId: string | null, options: UseFieldAudioOptions) {
  const [status, setStatus] = useState<FieldAudioStatus>(null);
  const [transcript, setTranscript] = useState("");
  const [lastResult, setLastResult] = useState<FieldAudioResult | null>(null);
  const [proposedCorrection, setProposedCorrection] = useState<ProposedCorrection | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("audio/webm");

  // Apply a correction the user confirmed on the device.
  const confirmCorrection = useCallback(async () => {
    if (!proposedCorrection || !jobId) return;
    setStatus("transcribing");
    try {
      const res = await fetch(`/api/jobs/${jobId}/field-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: options.businessId, submittedBy: options.submittedBy, confirmCorrection: proposedCorrection }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProposedCorrection(null);
        setStatus("success");
        options.onSuccess?.({ transcript: "", changesSummary: "Correction applied", updatedJob: data.updatedJob });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setTimeout(() => setStatus(null), 2500);
    }
  }, [proposedCorrection, jobId, options]);

  const cancelCorrection = useCallback(() => setProposedCorrection(null), []);

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
      setStatus("recording");
    } catch {
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

          try {
            const res = await fetch(`/api/jobs/${jobId}/field-audio`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                businessId: options.businessId,
                audioBase64: base64,
                mimeType: mimeTypeRef.current,
                submittedBy: options.submittedBy,
                jobContext: options.jobContext,
              }),
            });

            const data = await res.json();
            if (res.ok && data.proposedCorrection) {
              // Correction detected — surface a one-tap confirm card; don't apply yet.
              setTranscript(data.transcript || "");
              setProposedCorrection(data.proposedCorrection);
              setStatus(null);
            } else if (res.ok && data.success) {
              setTranscript(data.transcript || "");
              setLastResult(data);
              setStatus("success");
              options.onSuccess?.(data);
            } else {
              setStatus("error");
            }
          } catch {
            setStatus("error");
          } finally {
            setTimeout(() => setStatus(null), 3000);
            resolve();
          }
        };
      };

      recorder.stop();
    });
  }, [jobId, options]);

  return { status, transcript, lastResult, proposedCorrection, confirmCorrection, cancelCorrection, startRecording, stopRecording };
}
