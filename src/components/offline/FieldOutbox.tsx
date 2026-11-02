"use client";
import { useEffect, useState } from "react";
import { fieldIdentity, offlineIdentity } from "@/lib/offline/identity";
import { confirmOutboxItem, deleteOutboxItem, flushOutbox, keepOutboxItem, listOutbox, startOutboxRetry, type OutboxItem } from "@/lib/offline/outbox";

export function FieldOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let generation = 0;
    const update = async () => {
      const ticket = ++generation;
      const user = await fieldIdentity();
      const next = user ? await listOutbox(user.uid) : [];
      if (active && ticket === generation && user?.uid === offlineIdentity()?.uid) setItems(next);
    };
    const refresh = () => { void update().catch(() => {}); };
    const stop = startOutboxRetry(); refresh();
    const identityChanged = () => { setItems([]); setError(""); refresh(); };
    window.addEventListener("luxor-identity", identityChanged);
    window.addEventListener("luxor-outbox", refresh);
    return () => { active = false; stop(); window.removeEventListener("luxor-identity", identityChanged); window.removeEventListener("luxor-outbox", refresh); };
  }, []);
  const waiting = items.filter(i => i.state === "waiting").length;
  async function confirm(item: OutboxItem) {
    try {
      if ((await fieldIdentity())?.uid !== item.uid) throw new Error("Sign back in to manage this saved entry.");
      await confirmOutboxItem(item.uid, item.id); await flushOutbox();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save confirmation"); }
  }
  async function manage(item: OutboxItem, remove: boolean) {
    try {
      if ((await fieldIdentity())?.uid !== item.uid) throw new Error("Sign back in to manage this saved entry.");
      if (remove) await deleteOutboxItem(item.uid, item.id); else await keepOutboxItem(item.uid, item.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this saved entry"); }
  }
  const visible = [...items.filter(i => i.state !== "sent"), ...items.filter(i => i.state === "sent").slice(-10)];
  return <aside aria-live="polite" style={{ color: "inherit", fontSize: 13 }}>
    {waiting > 0 && <p>Saved on this phone — will send when you have signal ({waiting})</p>}
    {error && <p role="alert">{error}</p>}
    <div style={{ maxHeight: 280, overflowY: "auto" }}>{visible.map(item => {
      const correction = item.result?.proposedCorrection as Record<string, unknown> | undefined;
      const kind = item.url.endsWith("/field-audio") ? "Voice note" : item.url.endsWith("/photos") ? "Photo" : item.url.endsWith("/punch") ? "Clock tap" : "Note";
      return <div key={item.id} style={{ marginBottom: 8 }}>
        <span>{kind} · {item.jobId ?? "Time clock"} · {item.author} · {new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · </span>
        {item.state === "sent" ? "Sent ✓" : item.state === "confirmation" ? <>
          <p>Correction needs your approval: {String(correction?.item ?? "entry")} to {String(correction?.newValue ?? "")}. This has not been applied.</p>
          <button className="button" onClick={() => void confirm(item)}>Confirm correction</button>
          <button className="button" onClick={() => void manage(item, true)}>Cancel correction</button>
        </> : <span>{item.error ?? "Waiting for signal"}</span>}
        {item.state === "rejected" && <><p>{item.kept ? "Kept on this phone. It has not been sent." : "Not sent. Keep this entry here, or delete it."}</p><button className="button" onClick={() => void manage(item, false)}>Keep on this phone</button><button className="button" onClick={() => void manage(item, true)}>Delete</button></>}
      </div>;
    })}</div>
  </aside>;
}
