"use client";
import { startOutboxRetry } from "@/lib/offline/outbox";
import { useEffect, useState } from "react";
import { offlineReadState, reportConnection } from "@/lib/offline/readCache";

export function OfflineBanner() {
  const [state, setState] = useState(offlineReadState);
  useEffect(() => {
    const stop = startOutboxRetry();
    const refresh = () => setState(offlineReadState());
    const offline = () => reportConnection(true);
    const online = () => reportConnection(false);
    window.addEventListener("luxor-offline", refresh);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    if (!navigator.onLine) offline();
    return () => { stop(); window.removeEventListener("online", online); window.removeEventListener("luxor-offline", refresh); window.removeEventListener("offline", offline); };
  }, []);
  if (!state.disconnected) return null;
  const time = state.savedAt ? new Date(state.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return <div role="status" style={{ position: "sticky", top: 0, zIndex: 1000, padding: "8px 12px", background: "#fef3c7", color: "#78350f", textAlign: "center", fontSize: 13 }}>
    Offline{time ? ` — showing what was saved at ${time}` : " — no signal"}. Changes are paused. Field notes, photos and clock taps can still be saved on this phone.
  </div>;
}
