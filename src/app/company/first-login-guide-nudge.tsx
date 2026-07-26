"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, X } from "lucide-react";
import { guideNudgeStorageKey } from "./guide-nudge-storage";

export function FirstLoginGuideNudge({
  userId,
  guideHref,
}: {
  userId: string;
  guideHref: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const storageKey = guideNudgeStorageKey(userId);
    try {
      if (window.localStorage.getItem(storageKey)) return;
      // Mark it as seen when first presented, so a reload or later login never
      // turns a one-time welcome into a recurring banner.
      window.localStorage.setItem(storageKey, "seen");
    } catch {
      // Storage can be unavailable in hardened/private browsers. Keep this
      // session honest without making the Guide nudge block the app.
    }
    setVisible(true);
  }, [userId]);

  if (!visible) return null;

  return (
    <aside
      aria-label="Getting started"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 20,
        padding: "12px 14px",
        border: "1px solid rgba(15, 118, 110, 0.28)",
        borderRadius: 10,
        background: "rgba(15, 118, 110, 0.07)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Compass size={18} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Start here</p>
          <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
            Take the quick Guide tour to learn calls, scheduling, field updates, and invoicing.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Link
          className="button primary"
          href={guideHref}
          onClick={() => setVisible(false)}
          style={{ minHeight: 36, padding: "7px 12px" }}
        >
          Open Guide
        </Link>
        <button
          type="button"
          className="button"
          aria-label="Dismiss getting started"
          onClick={() => setVisible(false)}
          style={{ minHeight: 36, width: 36, padding: 0, display: "inline-grid", placeItems: "center" }}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
