"use client";
import { useEffect, useState } from "react";
import { DEFAULT_LETTERS } from "./letters";
import type { LetterTemplate } from "@/types/documentTemplate";

export function useLetterTemplates(enabled: boolean) {
  const [templates, setTemplates] = useState(DEFAULT_LETTERS);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/company/library/letters").then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => {
      if (live) { setTemplates({ ...DEFAULT_LETTERS, ...Object.fromEntries(d.templates.map((t: LetterTemplate) => [t.kind, t])) }); setError(""); }
    }).catch(() => { if (live) setError("Could not load saved letters. Reload before sending."); });
    return () => { live = false; };
  }, [enabled]);
  return { templates, error };
}
