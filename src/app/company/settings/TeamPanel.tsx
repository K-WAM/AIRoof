"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileUp, Mail, Trash2, UserPlus, Users } from "lucide-react";
import type { TeamMember, TeamRole } from "@/types/team";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";

const ROLES: TeamRole[] = ["owner", "staff", "viewer"];
const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", staff: "Staff", viewer: "Viewer" };
const ROLE_HINT: Record<TeamRole, string> = {
  owner: "Full access, including managing the team",
  staff: "Can work jobs, calls, pipeline, and the calendar",
  viewer: "Read-only access to everything",
};

interface CsvRow {
  email: string;
  role: TeamRole;
}

type CsvRowResult =
  | { email: string; status: "invited"; role: TeamRole }
  | { email: string; status: "already_member" | "conflict" | "invalid" | "seat_limit"; reason: string };

/** Dependency-free `email,role` CSV parser — good enough for a two-column
 * import (no quoted-field/embedded-comma support). Skips a header row if the
 * first cell looks like "email". Blank lines are ignored. */
function parseTeamCsv(text: string): CsvRow[] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^email\s*,/i.test(line))
    .map((line) => {
      const [emailRaw, roleRaw] = line.split(",");
      const email = (emailRaw ?? "").trim();
      const roleCandidate = (roleRaw ?? "").trim().toLowerCase();
      const role: TeamRole = (ROLES as string[]).includes(roleCandidate) ? (roleCandidate as TeamRole) : "staff";
      return { email, role };
    })
    .filter((row) => row.email.length > 0);
}

// Owner-only self-service team management (add teammates by email, assign a
// role, remove access) — the minimal-click alternative to a superadmin
// hand-relaying a temp password for every new hire.
export function TeamPanel({ businessId }: { businessId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seatLimit, setSeatLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("staff");
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);

  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvResults, setCsvResults] = useState<CsvRowResult[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCount = members.filter((m) => m.active).length;
  const atSeatLimit = seatLimit !== null && activeCount >= seatLimit;

  function flash(msg: string, tone: "ok" | "error" = "ok") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4000);
  }

  function loadTeam() {
    if (!businessId) return;
    setLoading(true);
    fetch(`/api/company/team?businessId=${businessId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Team request failed");
        return r.json();
      })
      .then((d: { members: TeamMember[]; seatLimit?: number }) => {
        setMembers(d.members ?? []);
        setSeatLimit(typeof d.seatLimit === "number" ? d.seatLimit : null);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Picks up a teammate invited via the global quick-add while sitting on this page.
  useQuickAddRefresh("teammate", loadTeam);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      setFormError("Enter an email address.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/company/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, email: trimmed, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error ?? "Could not send the invite.");
        return;
      }
      setInviteEmail("");
      setInviteRole("staff");
      setInviteOpen(false);
      loadTeam();
      if (data.invite?.status === "sent") {
        flash(`Invite emailed to ${trimmed}.`);
      } else {
        flash(`Added ${trimmed}, but the invite email didn't go out — send them a password reset link directly.`, "error");
      }
    } catch {
      setFormError("Network error — could not send the invite.");
    } finally {
      setInviting(false);
    }
  }

  function handleCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    setCsvResults(null);
    file.text().then((text) => {
      const rows = parseTeamCsv(text);
      if (rows.length === 0) {
        setCsvError("No email addresses found. Expect one \"email,role\" pair per line (role is optional).");
        setCsvRows([]);
        return;
      }
      setCsvRows(rows);
    });
  }

  async function importCsv() {
    if (csvRows.length === 0) return;
    setCsvImporting(true);
    setCsvError(null);
    try {
      const res = await fetch("/api/company/team/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, rows: csvRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvError(data.error ?? "The CSV import failed.");
        return;
      }
      setCsvResults(data.results ?? []);
      setCsvRows([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadTeam();
      const invited = (data.results ?? []).filter((r: CsvRowResult) => r.status === "invited").length;
      flash(`Imported ${invited} of ${data.results?.length ?? 0} row(s).`);
    } catch {
      setCsvError("Network error — the CSV import failed.");
    } finally {
      setCsvImporting(false);
    }
  }

  function cancelCsv() {
    setCsvRows([]);
    setCsvResults(null);
    setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function changeRole(member: TeamMember, role: TeamRole) {
    setBusyUid(member.uid);
    try {
      const res = await fetch(`/api/company/team/${member.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(data.error ?? "Could not change that role.", "error");
        return;
      }
      setMembers((prev) => prev.map((m) => (m.uid === member.uid ? { ...m, role } : m)));
    } catch {
      flash("Network error — could not change that role.", "error");
    } finally {
      setBusyUid(null);
    }
  }

  async function toggleActive(member: TeamMember) {
    const nextActive = !member.active;
    if (!nextActive && !confirm(`Remove ${member.email} from the team? They'll lose access immediately.`)) return;
    setBusyUid(member.uid);
    try {
      const res = await fetch(`/api/company/team/${member.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, active: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(data.error ?? "Could not update access.", "error");
        return;
      }
      setMembers((prev) => prev.map((m) => (m.uid === member.uid ? { ...m, active: nextActive } : m)));
      flash(nextActive ? `${member.email} reactivated.` : `${member.email} removed.`);
    } catch {
      flash("Network error — could not update access.", "error");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={16} strokeWidth={1.75} />
          Team
          {seatLimit !== null && (
            <span style={{ fontSize: 12, fontWeight: 500, color: atSeatLimit ? "#b91c1c" : "#94a3b8" }}>
              &nbsp;· {activeCount} / {seatLimit} seats used
            </span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button ghost small"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={atSeatLimit}
            title={atSeatLimit ? "Seat limit reached" : "Import teammates from a CSV file (email,role per line)"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <FileUp size={14} strokeWidth={1.75} />
            Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} hidden />
          <button
            className="button small"
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            disabled={atSeatLimit}
            title={atSeatLimit ? "Seat limit reached" : undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <UserPlus size={14} strokeWidth={1.75} />
            {inviteOpen ? "Cancel" : "Add teammate"}
          </button>
        </div>
      </div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
          Add anyone on your team by email and assign what they can do — one at a time, or import a CSV
          (columns: <code>email,role</code>; role defaults to staff). They each get one email with a link to
          set their own password — no passwords to relay by hand.
        </p>
        {atSeatLimit && (
          <p role="status" style={{ margin: "0 0 16px", fontSize: 12, color: "#b91c1c" }}>
            Seat limit reached ({activeCount}/{seatLimit}). Raise the seat limit in Client Config to add more.
          </p>
        )}

        {toast && (
          <div
            role="status"
            style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: toast.tone === "ok" ? "#f0fdf4" : "#fef2f2",
              color: toast.tone === "ok" ? "#15803d" : "#b91c1c",
              border: `1px solid ${toast.tone === "ok" ? "#86efac" : "#fca5a5"}`,
            }}
          >
            {toast.msg}
          </div>
        )}

        {inviteOpen && (
          <form
            onSubmit={invite}
            style={{
              display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18,
              padding: 14, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0",
            }}
          >
            <input
              type="email"
              required
              autoFocus
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ flex: "1 1 220px", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamRole)}
              title={ROLE_HINT[inviteRole]}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <button className="button primary small" type="submit" disabled={inviting}>
              {inviting ? "Sending…" : "Send invite"}
            </button>
            {formError && (
              <p role="alert" style={{ width: "100%", margin: 0, fontSize: 12, color: "#b91c1c" }}>{formError}</p>
            )}
          </form>
        )}

        {csvError && (
          <p role="alert" style={{ margin: "0 0 14px", fontSize: 12, color: "#b91c1c" }}>{csvError}</p>
        )}

        {csvRows.length > 0 && (
          <div style={{ marginBottom: 18, padding: 14, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>
              {csvRows.length} row{csvRows.length === 1 ? "" : "s"} ready to import
            </p>
            <div style={{ display: "grid", gap: 4, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
              {csvRows.map((row, i) => (
                <div key={`${row.email}-${i}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
                  <span>{row.email}</span>
                  <span style={{ color: "#94a3b8" }}>{ROLE_LABEL[row.role]}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button primary small" type="button" onClick={importCsv} disabled={csvImporting}>
                {csvImporting ? "Importing…" : `Import ${csvRows.length} teammate${csvRows.length === 1 ? "" : "s"}`}
              </button>
              <button className="button ghost small" type="button" onClick={cancelCsv} disabled={csvImporting}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {csvResults && (
          <div style={{ marginBottom: 18, padding: 14, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>Import results</p>
            <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {csvResults.map((r, i) => (
                <div key={`${r.email}-${i}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#334155" }}>{r.email}</span>
                  <span style={{ color: r.status === "invited" ? "#15803d" : "#b91c1c" }}>
                    {r.status === "invited" ? `Invited (${ROLE_LABEL[r.role]})` : r.reason}
                  </span>
                </div>
              ))}
            </div>
            <button className="button ghost small" type="button" onClick={() => setCsvResults(null)} style={{ marginTop: 10 }}>
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Loading team…</p>
        ) : loadError ? (
          <p role="alert" style={{ fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
            Team could not be loaded.
            <button className="button ghost small" type="button" onClick={loadTeam}>Retry</button>
          </p>
        ) : members.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94a3b8" }}>No teammates yet — add one above.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m) => (
              <div
                key={m.uid}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: m.active ? "#fff" : "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                  opacity: m.active ? 1 : 0.6,
                }}
              >
                <Mail size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.email}
                  </div>
                  {!m.active && <div style={{ fontSize: 11, color: "#94a3b8" }}>Removed</div>}
                </div>
                <select
                  value={m.role}
                  disabled={busyUid === m.uid || !m.active}
                  onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                  title={ROLE_HINT[m.role]}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <button
                  className="button ghost small"
                  type="button"
                  disabled={busyUid === m.uid}
                  onClick={() => toggleActive(m)}
                  title={m.active ? "Remove from team" : "Reactivate"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, color: m.active ? "#b91c1c" : "#15803d" }}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                  {m.active ? "Remove" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
