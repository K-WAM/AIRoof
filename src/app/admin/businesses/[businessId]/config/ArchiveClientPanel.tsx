"use client";

import { useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { InlineNotice } from "@/components/ui/InlineNotice";
import type { AccountPurpose } from "@/types";

export interface ArchiveClientResult {
  accountPurpose: AccountPurpose | null;
  previousAccountPurpose: AccountPurpose | null;
}

/**
 * T-349: hand-controlled hiding of fake clients. Archiving only changes accountPurpose (and the stored
 * previousAccountPurpose Restore reads); nothing is deleted. Demo tenants can't be archived.
 */
export function ArchiveClientPanel({
  businessId,
  businessName,
  accountPurpose,
  demo,
  onChanged,
}: {
  businessId: string;
  businessName: string;
  accountPurpose?: AccountPurpose | null;
  demo: boolean;
  onChanged: (result: ArchiveClientResult) => void;
}) {
  const archived = accountPurpose === "archived";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function setArchived(archivedNext: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/businesses/${businessId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: archivedNext }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this client.");
      onChanged({
        accountPurpose: data.accountPurpose ?? null,
        previousAccountPurpose: data.previousAccountPurpose ?? null,
      });
      setNotice(archivedNext ? "Client archived. You can restore it from here at any time." : "Client restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this client.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <section className="panel" id="archive" aria-labelledby="archive-title">
      <div className="panel-header">
        <h2 className="panel-title" id="archive-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Archive size={16} strokeWidth={1.75} />
          Archive
        </h2>
      </div>
      <div className="panel-body">
        {demo ? (
          <p className="helper-text" style={{ margin: 0 }}>Demo accounts can&apos;t be archived.</p>
        ) : archived ? (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tag">Archived</span>
              This client is in the Archived tab and doesn&apos;t count as a client.
            </p>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void setArchived(false)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <RotateCcw size={14} strokeWidth={1.75} />
              {busy ? "Restoring…" : "Restore"}
            </button>
          </>
        ) : (
          <>
            <p className="helper-text" style={{ margin: "0 0 12px" }}>
              Hides this client from the Clients list. Nothing is deleted, and you can restore it.
            </p>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Archive size={14} strokeWidth={1.75} />
              Archive client
            </button>
          </>
        )}
        {error ? <div style={{ marginTop: 12 }}><InlineNotice message={error} /></div> : null}
        {notice ? <p className="helper-text" role="status" style={{ marginTop: 12 }}>{notice}</p> : null}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => { if (!busy) setConfirmOpen(false); }}
        title="Archive client"
      >
        <p>
          Archive {businessName}? It moves to the Archived tab. Nothing is deleted and you can restore it.
        </p>
        <div className="button-row">
          <button type="button" className="button" disabled={busy} onClick={() => setConfirmOpen(false)}>
            Cancel
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void setArchived(true)}>
            {busy ? "Archiving…" : "Archive client"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
