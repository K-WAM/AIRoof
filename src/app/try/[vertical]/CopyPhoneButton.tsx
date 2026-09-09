"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the number is
      // already shown as large, selectable text, so this is a no-op, not a break.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="button"
      style={{ fontSize: 15, padding: "13px 20px", display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />}
      {copied ? "Copied" : "Copy number"}
    </button>
  );
}
