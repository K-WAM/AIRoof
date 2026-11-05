"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { clearCachedProfile } from "@/lib/auth/profileCache";

interface Choices {
  types: Array<{ id: string; label: string }>;
  members: Array<{ uid: string; label: string }>;
}

export function ViewAsMenu({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/admin/view-as?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load view-as choices.");
        if (!controller.signal.aborted) setChoices(data);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load choices."); });
    return () => controller.abort();
  }, [open, businessId]);

  async function start(choice: { userType: string } | { memberUid: string }) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...choice }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start view as.");
      clearCachedProfile();
      window.location.assign(data.landingPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start view as."); setBusy(false);
    }
  }

  return <>
    <button type="button" className="button" onClick={() => { setError(""); setChoices(null); setOpen(true); }} aria-haspopup="dialog">View as</button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title={`View as · ${businessName}`}>
      <p>See this client&apos;s app. Changes and customer messages are blocked.</p>
      {error && <InlineNotice message={error} />}
      {!choices && !error && <p role="status">Loading choices…</p>}
      {choices && <div style={{ maxHeight: "55vh", overflowY: "auto", display: "grid", gap: "var(--sp-2)" }}>
        {choices.types.map((type) => <button type="button" key={type.id} className="button" disabled={busy} onClick={() => void start({ userType: type.id })}>{type.label}</button>)}
        {choices.members.length > 0 && <p>Team members</p>}
        {choices.members.map((member) => <button type="button" key={member.uid} className="button" disabled={busy} onClick={() => void start({ memberUid: member.uid })}>{member.label}</button>)}
      </div>}
      {busy && <p role="status">Opening client view…</p>}
    </Modal>
  </>;
}
