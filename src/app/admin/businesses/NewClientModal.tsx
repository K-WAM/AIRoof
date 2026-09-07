"use client";

import { useState, type FormEvent } from "react";
import { Copy, Settings } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,20}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface CreatedClient {
  businessId: string;
  loginEmail?: string;
  tempPassword?: string;
}

/**
 * The fast path to onboard a client: name/contact/industry/seats only — every
 * agent-specific field (greeting, voice, Vapi IDs) keeps its existing
 * server-side default from the vertical template/plan preset (see
 * POST /api/admin/businesses) and can be tuned later from "Finish agent
 * setup" or the full /hub/onboarding wizard. Not a second create path —
 * same endpoint the wizard already posts to, just a shorter form in front of
 * it for the common case.
 */
export function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [businessIdEdited, setBusinessIdEdited] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [industry, setIndustry] = useState("roofing");
  const [serviceArea, setServiceArea] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [seatLimit, setSeatLimit] = useState("5");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClient | null>(null);

  function reset() {
    setBusinessName(""); setBusinessId(""); setBusinessIdEdited(false);
    setOwnerEmail(""); setPhoneNumber(""); setAddress("");
    setIndustry("roofing"); setServiceArea(""); setEmployeeCount(""); setSeatLimit("5");
    setError(null); setCreated(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleNameChange(value: string) {
    setBusinessName(value);
    if (!businessIdEdited) setBusinessId(slugify(value));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!businessName.trim() || !businessId.trim()) {
      setError("Enter a business name.");
      return;
    }
    if (!EMAIL_PATTERN.test(ownerEmail.trim())) {
      setError("Enter a valid owner email.");
      return;
    }
    if (phoneNumber.trim() && !PHONE_PATTERN.test(phoneNumber.trim())) {
      setError("Enter a valid phone number.");
      return;
    }
    if (!serviceArea.trim()) {
      setError("Enter at least one service area (city or region).");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: businessId.trim(),
          businessName: businessName.trim(),
          industry,
          ownerEmail: ownerEmail.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          address: address.trim() || undefined,
          serviceArea: serviceArea.split(",").map((a) => a.trim()).filter(Boolean),
          employeeCount: employeeCount ? Number(employeeCount) : undefined,
          seatLimit: seatLimit ? Number(seatLimit) : undefined,
          active: false,
          actorEmail: "connect@luxordev.com",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Client creation failed");

      setCreated({ businessId: data.businessId, loginEmail: data.loginEmail, tempPassword: data.tempPassword });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The client could not be created. Review the form and try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={created ? "Client created" : "New client"}>
      {created ? (
        <div className="quickadd-success">
          <p>✓ {created.businessId} created.</p>
          {created.loginEmail && created.tempPassword ? (
            <div style={{ margin: "10px 0 14px", padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Client login credentials (shown once)
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: "#1e293b" }}>Email: <strong>{created.loginEmail}</strong></p>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#1e293b" }}>
                Temp password: <strong style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>{created.tempPassword}</strong>
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(`Email: ${created.loginEmail}\nPassword: ${created.tempPassword}`)}
                className="button"
                style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <Copy size={13} strokeWidth={1.75} />
                Copy credentials
              </button>
            </div>
          ) : (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#166534" }}>No owner email provided — client login not provisioned.</p>
          )}
          <div className="button-row" style={{ justifyContent: "flex-start" }}>
            <a className="button primary" href={`/admin/businesses/${created.businessId}/config`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Settings size={14} strokeWidth={1.75} />
              Finish agent setup →
            </a>
            <button type="button" className="button" onClick={handleClose}>Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="nc-name">Business name *</label>
              <input id="nc-name" required autoFocus value={businessName} onChange={(e) => handleNameChange(e.target.value)} placeholder="Apex Roofing" />
            </div>
            <div className="field">
              <label htmlFor="nc-id">Business ID</label>
              <input
                id="nc-id"
                required
                value={businessId}
                onChange={(e) => { setBusinessId(slugify(e.target.value)); setBusinessIdEdited(true); }}
                placeholder="apex-roofing"
                style={{ fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
            <div className="field">
              <label htmlFor="nc-owner-email">Owner email *</label>
              <input id="nc-owner-email" type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@example.com" />
            </div>
            <div className="field">
              <label htmlFor="nc-phone">Phone</label>
              <input id="nc-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1 (305) 555-0100" />
            </div>
            <div className="field full">
              <label htmlFor="nc-address">Address</label>
              <input id="nc-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Miami, FL" />
            </div>
            <div className="field full">
              <label htmlFor="nc-service-area">Service area *</label>
              <input id="nc-service-area" required value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="Miami, Coral Gables, Doral" />
            </div>
            <div className="field">
              <label htmlFor="nc-industry">Industry</label>
              <select id="nc-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                {Object.values(VERTICAL_TEMPLATES).map((t) => (
                  <option value={t.verticalId} key={t.verticalId}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nc-employees">Employees</label>
              <input id="nc-employees" type="number" min="0" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} placeholder="8" />
            </div>
            <div className="field">
              <label htmlFor="nc-seats">Seat limit</label>
              <input id="nc-seats" type="number" min="1" value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
            Created as a draft with template defaults for voice, greeting, and rules — fine-tune those from
            &ldquo;Finish agent setup&rdquo; after creating, or use the full onboarding wizard instead for
            complete control up front.
          </p>
          <div className="button-row">
            <button className="button primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create client"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
