"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { TRADE_TITLE_LABEL, TEAM_ROLE_LABEL, type TradeTitle } from "@/types/team";
import type { Crew, CrewPerson } from "@/types/library";

// Same palette the API auto-assigns from — keeps manual picks visually consistent
// with newly created crews.
const CREW_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#65a30d"];

type Draft = { name: string; email: string; phone: string; active: boolean; kind: "crew" | "inspector" };

function personLabel(person: CrewPerson): string {
  const title = person.trade && person.trade in TRADE_TITLE_LABEL ? TRADE_TITLE_LABEL[person.trade as TradeTitle] : TEAM_ROLE_LABEL[person.role];
  return `${person.name} · ${title}`;
}

// Library → Crews (T-148). A crew is a Calendar row; its members are team members whose `crewId` points at it (one
// crew each — see CrewPerson). Owners change membership here or on the Team page; staff can edit crews but only see
// who is on them, because membership is team administration (PATCH /api/company/team/[uid] is owner-only).
export function CrewsSection({
  businessId, crews, setCrews, people, setPeople, readOnly,
}: {
  businessId: string | null;
  crews: Crew[];
  setCrews: (c: Crew[]) => void;
  people: CrewPerson[];
  setPeople: (p: CrewPerson[]) => void;
  readOnly: boolean;
}) {
  const { vocab, isEnabled } = useBusinessModules();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const resource = vocab.resourceNoun;
  const resources = vocab.resourceNounPlural;
  // Members only mean something where there is field work (a dental "Provider" row is already a person).
  const showMembers = isEnabled("jobs");
  const canManageMembers = !readOnly && (user?.role === "owner" || !!user?.superadmin);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"crew" | "inspector">("crew");
  const [adding, setAdding] = useState(false);
  const [pickerCrewId, setPickerCrewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ crewId: string; draft: Draft } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeCount = crews.filter((crew) => crew.active !== false).length;
  const activeInspectors = crews.filter((crew) => crew.active !== false && crew.kind === "inspector");
  const orderedCrews = [...crews.filter((crew) => crew.kind === "inspector"), ...crews.filter((crew) => crew.kind !== "inspector")];

  async function addCrew() {
    if (!name.trim() || !businessId) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await fetch("/api/company/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name, email, phone, kind }),
      });
      if (!res.ok) throw new Error("Resource creation failed");
      const data = await res.json();
      if (!data.crew) throw new Error("Resource creation failed");
      setCrews([...crews, data.crew]);
      setName(""); setEmail(""); setPhone(""); setKind("crew");
    } catch {
      setActionError(`The ${resource.toLowerCase()} could not be added. Try again.`);
    } finally {
      setAdding(false);
    }
  }

  async function removeCrew(crew: Crew) {
    const memberCount = people.filter((person) => person.crewId === crew.crewId).length;
    const consequences = isEnabled("jobs")
      ? `Its unfinished ${vocab.jobNounPlural.toLowerCase()} go back to Unscheduled${memberCount ? ` and its ${memberCount} member${memberCount === 1 ? "" : "s"} come off it` : ""}.`
      : "Its bookings go back to Unassigned.";
    if (!confirm(`Remove ${crew.name}? ${consequences}\n\nTo pause it without losing it, use Edit and turn Active off instead.`)) return;
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/company/crews?businessId=${businessId}&crewId=${crew.crewId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Resource deletion failed");
      setCrews(crews.filter((c) => c.crewId !== crew.crewId));
      setPeople(people.map((person) => (person.crewId === crew.crewId ? { ...person, crewId: undefined } : person)));
      const moved = (data.unscheduledJobs ?? 0) + (data.unassignedBookings ?? 0);
      setNotice(moved > 0
        ? `Removed ${crew.name}. ${moved} ${moved === 1 ? "item" : "items"} went back to ${isEnabled("jobs") ? "Unscheduled" : "Unassigned"} on the Calendar.`
        : `Removed ${crew.name}.`);
    } catch {
      setActionError(`The ${resource.toLowerCase()} could not be removed. Nothing changed.`);
    }
  }

  async function patchCrew(crewId: string, fields: Partial<Draft> & { color?: string }): Promise<Crew | null> {
    const response = await fetch("/api/company/crews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, crewId, ...fields }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Resource update failed");
    return data.crew ?? null;
  }

  async function setCrewColor(crewId: string, color: string) {
    const previous = crews;
    setCrews(previous.map((c) => (c.crewId === crewId ? { ...c, color } : c)));
    setPickerCrewId(null);
    setActionError(null);
    try {
      await patchCrew(crewId, { color });
    } catch {
      setCrews(previous);
      setActionError(`The ${resource.toLowerCase()} color could not be saved. The previous color was restored.`);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.draft.name.trim()) { setActionError(`A ${resource.toLowerCase()} needs a name.`); return; }
    setSavingEdit(true);
    setActionError(null);
    try {
      const saved = await patchCrew(editing.crewId, editing.draft);
      setCrews(crews.map((c) => (c.crewId === editing.crewId ? { ...c, ...(saved ?? editing.draft) } : c)));
      setEditing(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `The ${resource.toLowerCase()} could not be saved.`);
    } finally {
      setSavingEdit(false);
    }
  }

  async function setMembership(person: CrewPerson, crewId: string | null) {
    const previous = people;
    setPeople(people.map((p) => (p.uid === person.uid ? { ...p, crewId: crewId ?? undefined } : p)));
    setActionError(null);
    try {
      const response = await fetch(`/api/company/team/${encodeURIComponent(person.uid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, crewId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Membership update failed");
    } catch (error) {
      setPeople(previous);
      setActionError(error instanceof Error ? error.message : "That change could not be saved.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={16} strokeWidth={1.75} />
          {resources}
        </h2>
      </div>
      <div className="panel-body">
        {actionError && (
          <p role="alert" style={{ color: "var(--danger)", marginTop: 0 }}>
            {actionError}
          </p>
        )}
        {notice && <p role="status" style={{ marginTop: 0, color: "var(--accent)" }}>{notice}</p>}
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>
          {resources} are the rows on your Calendar — drag {isEnabled("jobs") ? `a ${vocab.jobNoun.toLowerCase()}` : "a booking"} onto one to schedule it.
          {isEnabled("jobs") ? " Confirming a job emails the crew's address and every member who has one." : ""} Click a color dot to change its Calendar color.
        </p>
        {crews.length > 0 && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }} data-testid="crew-capacity-line">
            {activeInspectors.length > 0
              ? "Phone bookings: one at a time per active inspector. Blocks and other bookings make that inspector busy."
              : `Your phone AI books up to ${activeCount} appointment${activeCount === 1 ? "" : "s"} at the same time — one per active ${resource.toLowerCase()}.`}
          </p>
        )}
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {orderedCrews.map((c, index) => {
            const members = people.filter((person) => person.crewId === c.crewId);
            const candidates = people.filter((person) => person.crewId !== c.crewId);
            const isEditing = editing?.crewId === c.crewId;
            const inactive = c.active === false;
            const previous = orderedCrews[index - 1];
            const showGroupHeading = index === 0 || (previous?.kind === "inspector" && c.kind !== "inspector");
            return (
              <Fragment key={c.crewId}>
              {showGroupHeading && <h3 style={{ margin: index === 0 ? "4px 0 0" : "14px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{c.kind === "inspector" ? "Inspectors" : "Crews"}</h3>}
              <div data-testid={`crew-card-${c.crewId}`} style={{ position: "relative", minWidth: 0, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, opacity: inactive && !isEditing ? 0.75 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => !readOnly && setPickerCrewId(pickerCrewId === c.crewId ? null : c.crewId)}
                    title="Change color"
                    aria-label={`Change ${c.name} color`}
                    disabled={readOnly}
                    style={{ width: 18, height: 18, borderRadius: "50%", background: c.color, flexShrink: 0, border: "2px solid #fff", boxShadow: "0 0 0 1px #d7dde5", cursor: readOnly ? "default" : "pointer", padding: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", overflowWrap: "anywhere" }}>
                      {c.name}
                      {inactive && <span className="tag">Inactive — not on the Calendar</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", overflowWrap: "anywhere" }}>{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}</div>
                  </div>
                  {!readOnly && !isEditing && (
                    <>
                      <Tooltip content="Edit">
                        <button
                          className="icon-del"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => setEditing({ crewId: c.crewId, draft: { name: c.name, email: c.email ?? "", phone: c.phone ?? "", active: c.active !== false, kind: c.kind === "inspector" ? "inspector" : "crew" } })}
                        >
                          <Pencil size={14} strokeWidth={1.75} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Remove">
                        <button onClick={() => removeCrew(c)} className="icon-del" aria-label={`Remove ${c.name}`}>
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>

                {isEditing && editing && (
                  <div className="form-grid" style={{ alignItems: "end", marginTop: 12 }}>
                    <div className="field"><label>{resource} name</label><input aria-label={`${resource} name`} value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} /></div>
                    <div className="field"><label>Email</label><input aria-label={`${resource} email`} type="email" value={editing.draft.email} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, email: e.target.value } })} placeholder="name@company.com" /></div>
                    <div className="field"><label>Phone</label><input aria-label={`${resource} phone`} value={editing.draft.phone} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, phone: e.target.value } })} /></div>
                    <div className="field"><label>Type</label><select aria-label={`${resource} type`} value={editing.draft.kind} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, kind: e.target.value as "crew" | "inspector" } })}><option value="crew">Crew</option><option value="inspector">Inspector</option></select></div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13 }}>
                      <input type="checkbox" checked={editing.draft.active} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, active: e.target.checked } })} style={{ width: 18, height: 18 }} />
                      Active (on the Calendar, counts for phone bookings)
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="button primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save"}</button>
                      <button className="button" onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</button>
                    </div>
                  </div>
                )}

                {showMembers && (
                  <div style={{ marginTop: 10, paddingLeft: 30, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }} aria-label={`${c.name} members`}>
                    {members.length === 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>No members yet.</span>}
                    {members.map((person) => (
                      <span key={person.uid} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {personLabel(person)}
                        {canManageMembers && (
                          <button
                            type="button"
                            onClick={() => setMembership(person, null)}
                            aria-label={`Take ${person.name} off ${c.name}`}
                            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex", color: "inherit" }}
                          >
                            <X size={12} strokeWidth={2} />
                          </button>
                        )}
                      </span>
                    ))}
                    {canManageMembers && (
                      candidates.length > 0 ? (
                        <select
                          aria-label={`Add a member to ${c.name}`}
                          value=""
                          onChange={(e) => {
                            const person = people.find((p) => p.uid === e.target.value);
                            if (person) void setMembership(person, c.crewId);
                          }}
                          style={{ fontSize: 12, minHeight: 32 }}
                        >
                          <option value="">＋ Add member…</option>
                          {candidates.map((person) => {
                            const current = person.crewId ? crews.find((crew) => crew.crewId === person.crewId)?.name : undefined;
                            return (
                              <option key={person.uid} value={person.uid}>
                                {personLabel(person)}{current ? ` (moves from ${current})` : ""}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <Link href={`/company/team${preview ? `?preview=${preview}` : ""}`} style={{ fontSize: 12 }}>
                          Invite people on the Team page to add them here
                        </Link>
                      )
                    )}
                  </div>
                )}

                {pickerCrewId === c.crewId && (
                  <>
                    <div onClick={() => setPickerCrewId(null)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                    <div style={{ position: "absolute", top: 34, left: 14, zIndex: 21, display: "flex", gap: 6, padding: "8px 10px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.14)" }}>
                      {CREW_COLORS.map((hex) => (
                        <button
                          key={hex}
                          onClick={() => setCrewColor(c.crewId, hex)}
                          title={hex}
                          aria-label={`Use color ${hex}`}
                          style={{
                            width: 22, height: 22, borderRadius: "50%", background: hex, cursor: "pointer",
                            border: c.color === hex ? "2px solid #0f172a" : "2px solid transparent",
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              </Fragment>
            );
          })}
          {showMembers && crews.length > 0 && !readOnly && !canManageMembers && (
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Only an owner can change who is on a {resource.toLowerCase()}.</p>
          )}
          {/* The add form right below is the one action — a second "Add" button here would only duplicate it. */}
          {crews.length === 0 && (
            <EmptyState
              compact
              title={`Add your first ${resource.toLowerCase()}`}
              body={readOnly ? `Ask the owner to add your ${resources.toLowerCase()}.` : "Type a name below. It becomes a row on your Calendar."}
              testId="library-crews-empty"
            />
          )}
        </div>
        {!readOnly && (
          <div className="form-grid" style={{ alignItems: "end" }}>
            <div className="field"><label>{resource} name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder={vocab.resourcePlaceholder} /></div>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
            <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (305) 555-0100" /></div>
            <div className="field"><label>Type</label><select aria-label="Resource type" value={kind} onChange={(e) => setKind(e.target.value as "crew" | "inspector")}><option value="crew">Crew</option><option value="inspector">Inspector</option></select></div>
            <div className="field">
              <button className="button primary" onClick={addCrew} disabled={adding || !name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={15} strokeWidth={1.75} />
                {adding ? "Adding…" : `Add ${resource.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
