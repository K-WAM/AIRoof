"use client";

import { useEffect, useRef, useState } from "react";

// ── Cross-browser Speech Recognition types ────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionAPI;
    webkitSpeechRecognition: new () => SpeechRecognitionAPI;
  }
}
interface SpeechRecognitionAPI extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SRResultEvent extends Event {
  results: { length: number; [i: number]: { isFinal: boolean; [i: number]: { transcript: string } } };
}
interface SRErrorEvent extends Event { error: string; }

// ── Overlap-aware deduplication ───────────────────────────────────────────────
// When Android Chrome restarts a recognition session it may re-emit buffered
// speech starting from the beginning. This function appends `incoming` only if
// it adds new content: if it's fully at the tail of `existing`, skip; if it
// partially overlaps the tail, append only the new suffix.
export function appendDeduped(existing: string, incoming: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const e = norm(existing);
  const inc = norm(incoming);
  if (!inc) return e;
  if (e.endsWith(inc)) return e;

  // Find the longest suffix of `e` that equals a prefix of `inc`
  // (min 4 chars to avoid false positives on common short words)
  for (let len = Math.min(e.length, inc.length); len >= 4; len--) {
    if (e.endsWith(inc.slice(0, len))) {
      const tail = inc.slice(len).trimStart();
      return tail ? e + " " + tail : e;
    }
  }
  return e ? e + " " + inc : inc;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSpeechRecorder() {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");

  const pressingRef = useRef(false);
  const recRef = useRef<SpeechRecognitionAPI | null>(null);
  // Incremented on button release. Stale onend/onerror callbacks check this
  // to decide whether to restart, preventing ghost appends after release.
  const sessionIdRef = useRef(0);
  const langRef = useRef("en-US");

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    langRef.current = navigator.language || "en-US";
  }, []);

  function startRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    const myId = ++sessionIdRef.current;
    const rec = new SR();
    rec.lang = langRef.current;
    rec.continuous = false;   // short sessions — avoids Android Chrome 20s buffer-bleed at the source
    rec.interimResults = true;

    // Finals accumulate within this session; committed once on onend (not per-result).
    // This prevents double-commits when onerror fires followed by onend.
    let sessionFinal = "";

    rec.onresult = (e: SRResultEvent) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          sessionFinal = appendDeduped(sessionFinal, e.results[i][0].transcript);
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    rec.onerror = (e: SRErrorEvent) => {
      setInterimText("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        pressingRef.current = false;
        setPressing(false);
        return;
      }
      // Transient error: commit any captured finals and let onend handle restart.
      // Clear sessionFinal so onend doesn't double-commit.
      if (sessionFinal.trim()) {
        const captured = sessionFinal;
        sessionFinal = "";
        setText(prev => appendDeduped(prev, captured));
      }
    };

    rec.onend = () => {
      setInterimText("");
      // Always commit this session's finals — even if button was released mid-session.
      if (sessionFinal.trim()) {
        setText(prev => appendDeduped(prev, sessionFinal));
      }
      // Only restart if this session is still "current" (button still held and no newer session started).
      if (myId === sessionIdRef.current && pressingRef.current) {
        setTimeout(() => {
          if (pressingRef.current && myId === sessionIdRef.current) startRecognition();
        }, 200);
      }
    };

    rec.start();
    recRef.current = rec;
  }

  function handlePressStart(e: React.PointerEvent) {
    e.preventDefault();
    if (pressingRef.current) return;
    pressingRef.current = true;
    setPressing(true);
    startRecognition();
  }

  function handlePressEnd() {
    if (!pressingRef.current) return;
    pressingRef.current = false;
    setPressing(false);
    // Increment before stop() so the stale onend callback sees the mismatch and skips restart.
    // It still commits any captured sessionFinal (we want that).
    sessionIdRef.current++;
    recRef.current?.stop();
    setInterimText("");
  }

  return { text, setText, interimText, pressing, voiceSupported, handlePressStart, handlePressEnd, langRef };
}
