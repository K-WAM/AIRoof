"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, ChevronLeft, Package, UserPlus, Users, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { VerticalVocab } from "@/lib/verticals/templates";
import { emitQuickAddCreated, type QuickAddKind } from "@/lib/events/quickAdd";
import type { LibraryPricing } from "@/types/library";
import { TEAM_ROLES, type TeamRole } from "@/types/team";

interface QuickAddContextValue {
  /** null = closed, "menu" = the picker, a specific kind = straight to that form. */
  panel: "menu" | QuickAddKind | null;
  openMenu: () => void;
  /** `prefillName` seeds the form's name field — e.g. a material row's item
   * name, when a "no price on file" tooltip jumps straight to "+ Add material". */
  open: (kind: QuickAddKind, prefillName?: string) => void;
  close: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within a QuickAddProvider");
  return ctx;
}

/**
 * Mounts the global quick-add: a "+" reachable from any company page opens a
 * picker (Job / Resource / Teammate, filtered to what this tenant's industry
 * and the signed-in user's role actually allow) and the matching create form
 * — reusing the exact endpoints their home pages already use, so nothing
 * about validation or persistence is duplicated. `useQuickAdd().open(kind)`
 * jumps straight to one form, skipping the picker — that's what a
 * `BlockedAction` card calls so "add a crew first" resolves in place instead
 * of navigating away and back.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<"menu" | QuickAddKind | null>(null);
  const [prefillName, setPrefillName] = useState<string | undefined>(undefined);
  const openMenu = useCallback(() => { setPrefillName(undefined); setPanel("menu"); }, []);
  const open = useCallback((kind: QuickAddKind, name?: string) => { setPrefillName(name); setPanel(kind); }, []);
  const close = useCallback(() => { setPanel(null); setPrefillName(undefined); }, []);
  const value = useMemo(() => ({ panel, openMenu, open, close }), [panel, openMenu, open, close]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddPanel panel={panel} prefillName={prefillName} openMenu={openMenu} open={open} close={close} />
    </QuickAddContext.Provider>
  );
}

function QuickAddPanel({
  panel,
  prefillName,
  openMenu,
  open,
  close,
}: {
  panel: "menu" | QuickAddKind | null;
  prefillName?: string;
  openMenu: () => void;
  open: (kind: QuickAddKind, name?: string) => void;
  close: () => void;
}) {
  const businessId = useBusinessId();
  const { vocab, isEnabled, ready: modulesReady } = useBusinessModules();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  if (panel === null) return null;

  // A dental office never sees "+ New Job"; only an owner/superadmin can invite —
  // same gates their home pages already enforce (MODULE_ROUTES, TeamPanel).
  const canJob = modulesReady && isEnabled("jobs");
  const canMaterial = modulesReady && isEnabled("pricing");
  const canTeammate = Boolean(user?.role === "owner" || user?.superadmin);

  const items: { kind: QuickAddKind; icon: LucideIcon; label: string }[] = [
    ...(canJob ? [{ kind: "job" as const, icon: Briefcase, label: `New ${vocab.jobNoun}` }] : []),
    { kind: "crew" as const, icon: Users, label: `New ${vocab.resourceNoun}` },
    ...(canMaterial ? [{ kind: "material" as const, icon: Package, label: "New material price" }] : []),
    ...(canTeammate ? [{ kind: "teammate" as const, icon: UserPlus, label: "Invite teammate" }] : []),
  ];

  const titles: Record<QuickAddKind, string> = {
    job: `New ${vocab.jobNoun}`,
    crew: `New ${vocab.resourceNoun}`,
    material: "New material price",
    teammate: "Invite teammate",
  };

  const back = panel !== "menu"
    ? (
      <button type="button" className="modal-back" aria-label="Back to quick add menu" onClick={openMenu}>
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
    )
    : undefined;

  return (
    <Modal open onClose={close} title={panel === "menu" ? "Quick add" : titles[panel]} headerLeft={back}>
      {panel === "menu" && (
        <div className="quickadd-menu">
          {items.map(({ kind, icon: Icon, label }) => (
            <button key={kind} type="button" className="quickadd-menu-item" onClick={() => open(kind)}>
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      )}
      {panel === "job" && (
        <JobQuickAddForm businessId={businessId} vocab={vocab} previewSuffix={previewSuffix} onDone={close} />
      )}
      {panel === "crew" && (
        <CrewQuickAddForm businessId={businessId} vocab={vocab} previewSuffix={previewSuffix} />
      )}
      {panel === "material" && (
        <MaterialQuickAddForm businessId={businessId} prefillName={prefillName} previewSuffix={previewSuffix} />
      )}
      {panel === "teammate" && (
        <TeammateQuickAddForm businessId={businessId} previewSuffix={previewSuffix} />
      )}
    </Modal>
  );
}

// ── Job ──────────────────────────────────────────────────────────────────

function JobQuickAddForm({
  businessId, vocab, previewSuffix, onDone,
}: { businessId: string; vocab: VerticalVocab; previewSuffix: string; onDone: () => void }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ jobId: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          title: fd.get("title"),
          clientName: fd.get("clientName"),
          clientPhone: fd.get("clientPhone"),
          address: fd.get("address"),
          serviceType: fd.get("serviceType"),
          notes: fd.get("notes"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.job) throw new Error("Job creation failed");
      emitQuickAddCreated({ kind: "job", id: data.job.jobId });
      setCreated({ jobId: data.job.jobId });
    } catch {
      setError(`The ${vocab.jobNoun.toLowerCase()} could not be created. Review the form and try again.`);
    } finally {
      setCreating(false);
    }
  }

  if (created) {
    return (
      <div className="quickadd-success">
        <p>✓ {vocab.jobNoun} {created.jobId} created.</p>
        <div className="button-row" style={{ justifyContent: "flex-start" }}>
          <a className="button primary" href={`/company/jobs/${created.jobId}${previewSuffix}`}>
            View {vocab.jobNoun.toLowerCase()} →
          </a>
          <button type="button" className="button" onClick={() => setCreated(null)}>Add another</button>
          <button type="button" className="button ghost" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="qa-job-title">{vocab.jobNoun} title *</label>
          <input id="qa-job-title" name="title" required autoFocus placeholder={vocab.jobTitlePlaceholder} />
        </div>
        <div className="field">
          <label htmlFor="qa-job-clientName">Client name</label>
          <input id="qa-job-clientName" name="clientName" placeholder="John Smith" />
        </div>
        <div className="field">
          <label htmlFor="qa-job-clientPhone">Client phone</label>
          <input id="qa-job-clientPhone" name="clientPhone" placeholder="+1 (305) 555-0100" />
        </div>
        <div className="field full">
          <label htmlFor="qa-job-address">Address</label>
          <input id="qa-job-address" name="address" placeholder="123 Main St, Miami, FL" />
        </div>
        <div className="field">
          <label htmlFor="qa-job-serviceType">Service type</label>
          <input id="qa-job-serviceType" name="serviceType" placeholder={vocab.serviceTypePlaceholder} />
        </div>
        <div className="field full">
          <label htmlFor="qa-job-notes">Notes</label>
          <input id="qa-job-notes" name="notes" placeholder="Any additional context…" />
        </div>
      </div>
      <div className="button-row">
        <button className="button primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : `Create ${vocab.jobNoun}`}
        </button>
      </div>
    </form>
  );
}

// ── Crew / resource ──────────────────────────────────────────────────────

function CrewQuickAddForm({
  businessId, vocab, previewSuffix,
}: { businessId: string; vocab: VerticalVocab; previewSuffix: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/company/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name, email, phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.crew) throw new Error("Resource creation failed");
      emitQuickAddCreated({ kind: "crew", id: data.crew.crewId });
      setCreated({ name: data.crew.name });
      setName(""); setEmail(""); setPhone("");
    } catch {
      setError(`The ${vocab.resourceNoun.toLowerCase()} could not be added. Try again.`);
    } finally {
      setAdding(false);
    }
  }

  if (created) {
    return (
      <div className="quickadd-success">
        <p>✓ {created.name} added to your {vocab.resourceNounPlural.toLowerCase()}.</p>
        <div className="button-row" style={{ justifyContent: "flex-start" }}>
          <a
            className="button primary"
            href={`/company/library${previewSuffix ? previewSuffix + "&section=crews" : "?section=crews"}`}
          >
            Manage {vocab.resourceNounPlural.toLowerCase()} →
          </a>
          <button type="button" className="button" onClick={() => setCreated(null)}>Add another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="qa-crew-name">{vocab.resourceNoun} name *</label>
          <input id="qa-crew-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={vocab.resourcePlaceholder} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="qa-crew-email">Email</label>
          <input id="qa-crew-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div className="field full">
          <label htmlFor="qa-crew-phone">Phone</label>
          <input id="qa-crew-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (305) 555-0100" />
        </div>
      </div>
      <div className="button-row">
        <button className="button primary" type="submit" disabled={adding || !name.trim()}>
          {adding ? "Adding…" : `Add ${vocab.resourceNoun}`}
        </button>
      </div>
    </form>
  );
}

// ── Material price ───────────────────────────────────────────────────────

function MaterialQuickAddForm({
  businessId, prefillName, previewSuffix,
}: { businessId: string; prefillName?: string; previewSuffix: string }) {
  const [name, setName] = useState(prefillName ?? "");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      // The catalog is a whole-array PUT (unlike Job/Crew/Teammate's single-row
      // POST), so read the current list first and append — never send a
      // one-item array that would silently wipe out the rest of the catalog.
      const libRes = await fetch(`/api/company/library?businessId=${businessId}`);
      if (!libRes.ok) throw new Error("Library fetch failed");
      const { library } = await libRes.json();
      const price = parseFloat(unitPrice);
      const nextMaterials: LibraryPricing["materials"] = [
        ...(library?.materials ?? []),
        { name: name.trim(), unit: unit.trim(), unitPrice: Number.isFinite(price) ? price : 0 },
      ];
      const res = await fetch("/api/company/library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, materials: nextMaterials }),
      });
      if (!res.ok) throw new Error("Material save failed");
      emitQuickAddCreated({ kind: "material" });
      setCreated({ name: name.trim() });
      setName(""); setUnit(""); setUnitPrice("");
    } catch {
      setError("The material could not be added. Try again.");
    } finally {
      setAdding(false);
    }
  }

  if (created) {
    return (
      <div className="quickadd-success">
        <p>✓ {created.name} added to your pricing catalog.</p>
        <div className="button-row" style={{ justifyContent: "flex-start" }}>
          <a
            className="button primary"
            href={`/company/library${previewSuffix ? previewSuffix + "&section=pricing" : "?section=pricing"}`}
          >
            Manage pricing →
          </a>
          <button type="button" className="button" onClick={() => setCreated(null)}>Add another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="qa-material-name">Material name *</label>
          <input id="qa-material-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Architectural shingles" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="qa-material-unit">Unit</label>
          <input id="qa-material-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sq / piece / bundle" />
        </div>
        <div className="field full">
          <label htmlFor="qa-material-price">Unit price ($)</label>
          <input id="qa-material-price" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Saved to your pricing catalog (Library → Pricing) — future field notes mentioning this material auto-fill
        its price on invoices.
      </p>
      <div className="button-row">
        <button className="button primary" type="submit" disabled={adding || !name.trim()}>
          {adding ? "Adding…" : "Add material"}
        </button>
      </div>
    </form>
  );
}

// ── Teammate ─────────────────────────────────────────────────────────────

function TeammateQuickAddForm({
  businessId, previewSuffix,
}: { businessId: string; previewSuffix: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; sent: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter an email address.");
      return;
    }
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/company/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, email: trimmed, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send the invite.");
        return;
      }
      emitQuickAddCreated({ kind: "teammate" });
      setCreated({ email: trimmed, sent: data.invite?.status === "sent" });
      setEmail(""); setRole("staff");
    } catch {
      setError("Network error — could not send the invite.");
    } finally {
      setInviting(false);
    }
  }

  if (created) {
    return (
      <div className="quickadd-success">
        <p>
          {created.sent
            ? `✓ Invite emailed to ${created.email}.`
            : `Added ${created.email}, but the invite email didn't go out — send them a password reset link from Settings.`}
        </p>
        <div className="button-row" style={{ justifyContent: "flex-start" }}>
          <a className="button primary" href={`/company/settings${previewSuffix}`}>Manage team →</a>
          <button type="button" className="button" onClick={() => setCreated(null)}>Add another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="qa-team-email">Email *</label>
          <input id="qa-team-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
        </div>
        <div className="field full">
          <label htmlFor="qa-team-role">Role</label>
          <select id="qa-team-role" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        They get one email with a link to set their own password — no passwords to relay by hand.
      </p>
      <div className="button-row">
        <button className="button primary" type="submit" disabled={inviting}>
          {inviting ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}
