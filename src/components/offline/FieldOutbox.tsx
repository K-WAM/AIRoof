"use client";
import { useEffect, useState } from "react";
import { fieldIdentity } from "@/lib/offline/identity";
import { deleteOutboxItem, enqueueField, flushOutbox, listOutbox, startOutboxRetry, type OutboxItem } from "@/lib/offline/outbox";

export function FieldOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const update = async () => {
      const user = await fieldIdentity();
      const next = user ? await listOutbox(user.uid) : [];
      if (active) setItems(next);
    };
    const refresh = () => { void update().catch(() => {}); };
    const stop = startOutboxRetry(); refresh();
    window.addEventListener("luxor-outbox", refresh);
    return () => { active = false; stop(); window.removeEventListener("luxor-outbox", refresh); };
  }, []);
  const waiting = items.filter(i => i.state === "waiting").length;
  async function confirm(item: OutboxItem) {
    try {
      await enqueueField(item.url, { businessId: item.businessId, submittedBy: item.author, confirmCorrection: item.result?.proposedCorrection });
      await deleteOutboxItem(item.uid, item.id); await flushOutbox();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save confirmation"); }
  }
  const visible = [...items.filter(i => i.state !== "sent"), ...items.filter(i => i.state === "sent").slice(-10)];
  return <aside aria-live="polite" style={{ color: "inherit", fontSize: 13 }}>
    {waiting > 0 && <p>Saved on this phone — will send when you have signal ({waiting})</p>}
    {error && <p role="alert">{error}</p>}
    {visible.map(item => {
      const correction = item.result?.proposedCorrection as Record<string, unknown> | undefined;
      return <div key={item.id} style={{ marginBottom: 8 }}>
        <span>{item.jobId ?? "Time clock"} · {new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · </span>
        {item.state === "sent" ? "Sent ✓" : item.state === "confirmation" ? <>
          <p>Correction needs your approval: {String(correction?.item ?? "entry")} to {String(correction?.newValue ?? "")}. This has not been applied.</p>
          <button className="button" onClick={() => void confirm(item)}>Confirm correction</button>
          <button className="button" onClick={() => void deleteOutboxItem(item.uid, item.id)}>Cancel correction</button>
        </> : <span>{item.error ?? "Waiting for signal"}</span>}
        {item.state === "rejected" && <><p>Not sent. Keep this entry here, or delete it.</p><button className="button" onClick={() => void deleteOutboxItem(item.uid, item.id)}>Delete</button></>}
      </div>;
    })}
  </aside>;
}
