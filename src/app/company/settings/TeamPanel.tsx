"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Mail, Trash2, UserPlus, Users } from "lucide-react";
import type { TeamMember, TeamRole } from "@/types/team";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";

const ROLES: TeamRole[] = ["owner", "staff", "viewer"];
const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", staff: "Staff", viewer: "Viewer" };
const ROLE_HINT: Record<TeamRole, string> = {
  owner: "Full access, including managing the team",
  staff: "Can work jobs, calls, pipeline, and the calendar",
  viewer: "Read-only access to everything",
};

// Owner-only self-service team management (add teammates by email, assign a
// role, remove access) — the minimal-click alternative to a superadmin
// hand-relaying a temp password for every new hire.
export function TeamPanel({ businessId }: { businessId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("staff");
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);

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
      .then((d: { members: TeamMember[] }) => {
        setMembers(d.members ?? []);
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
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={16} strokeWidth={1.75} />
          Team
        </h2>
        <button
          className="button small"
          type="button"
          onClick={() => setInviteOpen((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <UserPlus size={14} strokeWidth={1.75} />
          {inviteOpen ? "Cancel" : "Add teammate"}
        </button>
      </div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
          Add anyone on your team by email and assign what they can do. They get one email with a link to set
          their own password — no passwords to relay by hand.
        </p>

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
