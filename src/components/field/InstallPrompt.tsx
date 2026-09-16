"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// A regular browser tab can never hide its own address bar — no website can
// suppress that chrome, in any browser, by design. The one real fix is
// "Add to Home Screen": launching from the home-screen icon runs the PWA in
// `display: standalone` (already set in public/manifest.json), which is
// chrome-free. Nobody was ever being prompted to actually do that, so in
// practice every field visit — however clean the URL itself already is —
// still showed a full browser UI. This is the missing nudge.
const DISMISS_KEY = "luxorFieldInstallDismissedAt";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === "undefined") return true; // never flash the banner during SSR/hydration
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !("MSStream" in window);
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** "Add to Home Screen" nudge for /field and /company/field — mobile only, dismissible,
 *  and silent once already installed or on desktop. See file-level comment for why this
 *  exists: it's the only real lever this app has over "the URL bar shows on mobile." */
export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;
    setIos(isIOS());
    setVisible(true);

    // Android/Chrome: capture the real install prompt instead of just instructing.
    // preventDefault stops the browser's own mini-infobar so this banner is the one UI.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="field-install-prompt"
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        margin: "0 20px 12px", background: "#132043", border: "1px solid #22335f",
        borderRadius: 12, fontSize: 12.5, color: "#c7d2fe", lineHeight: 1.4,
      }}
    >
      {ios ? <Share size={16} strokeWidth={1.75} style={{ flexShrink: 0, color: "#93c5fd" }} /> : <Download size={16} strokeWidth={1.75} style={{ flexShrink: 0, color: "#93c5fd" }} />}
      <span style={{ flex: 1 }}>
        {ios
          ? <>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> — no address bar, opens like an app.</>
          : deferredPrompt
          ? <>Install this for a faster, full-screen experience — no address bar.</>
          : <>Use your browser menu → <strong>Add to Home Screen</strong> — no address bar, opens like an app.</>}
      </span>
      {!ios && deferredPrompt && (
        <button
          type="button"
          onClick={install}
          style={{ flexShrink: 0, background: "#3b5bdb", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ flexShrink: 0, background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", padding: 2 }}
      >
        <X size={15} strokeWidth={1.75} />
      </button>
      <style>{`@media (min-width: 700px) { .field-install-prompt { display: none !important; } }`}</style>
    </div>
  );
}
