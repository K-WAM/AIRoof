"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExampleTag } from "@/components/ui/ExampleTag";
import { FormField } from "@/components/ui/FormField";
import { Sheet } from "@/components/ui/Sheet";
import { cityState, displayPhone, matchesVendor } from "@/lib/vendors/search";
import type { Vendor } from "@/types/vendor";

// Library -> Vendors (T-370): the manufacturers, suppliers and subcontractors this business buys from. Labelled
// "Suppliers" where the industry already calls its crews "Vendors" (property management). Nothing is sent to a vendor.

const PAGE = 30;
type Draft = { name: string; type: string; address: string; city: string; state: string; zip: string; phone: string; contactName: string; email: string; website: string; notes: string };
const EMPTY: Draft = { name: "", type: "", address: "", city: "", state: "", zip: "", phone: "", contactName: "", email: "", website: "", notes: "" };

function draftOf(vendor: Vendor): Draft {
  return {
    name: vendor.name, type: vendor.type ?? "", address: vendor.address ?? "", city: vendor.city ?? "", state: vendor.state ?? "", zip: vendor.zip ?? "",
    phone: vendor.phone ?? "", contactName: vendor.contactName ?? "", email: vendor.email ?? "", website: vendor.website ?? "", notes: vendor.notes ?? "",
  };
}

export function VendorsSection({ businessId, readOnly }: { businessId: string | null; readOnly: boolean }) {
  const { vocab } = useBusinessModules();
  const plural = vocab.resourceNoun === "Vendor" ? "Suppliers" : "Vendors";
  const one = plural === "Suppliers" ? "supplier" : "vendor";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [editing, setEditing] = useState<{ vendor: Vendor | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const response = await fetch(`/api/company/vendors?businessId=${encodeURIComponent(businessId)}`);
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setVendors(Array.isArray(data.vendors) ? data.vendors : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);

  const inactiveCount = vendors.filter((vendor) => !vendor.active).length;
  const shown = useMemo(
    () => vendors.filter((vendor) => (showInactive || vendor.active) && matchesVendor(vendor, query)),
    [vendors, showInactive, query],
  );

  async function save() {
    if (!editing || !businessId) return;
    if (!editing.draft.name.trim()) { setError(`A ${one} needs a name.`); return; }
    setSaving(true);
    setError(null);
    try {
      const target = editing.vendor ? `/api/company/vendors/${encodeURIComponent(editing.vendor.vendorId)}` : "/api/company/vendors";
      const response = await fetch(target, {
        method: editing.vendor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...editing.draft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `The ${one} could not be saved.`);
      await load();
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The ${one} could not be saved.`);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(vendor: Vendor, active: boolean) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/company/vendors/${encodeURIComponent(vendor.vendorId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, active }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "That could not be saved.");
      await load();
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setEditing((current) => (current ? { ...current, draft: { ...current.draft, [key]: event.target.value } } : current));
  const openAdd = () => { setError(null); setEditing({ vendor: null, draft: EMPTY }); };

  if (loading) return <section className="panel" role="status" aria-label={`Loading ${plural.toLowerCase()}`} style={{ padding: 20, minHeight: 160 }}>Loading…</section>;
  if (loadError) return <p role="alert" style={{ color: "var(--danger)" }}>The {plural.toLowerCase()} could not be loaded. Refresh and try again.</p>;

  return (
    <section className="panel" data-testid="vendors-section">
      <div className="panel-header">
        <h2 className="panel-title">{plural}</h2>
      </div>
      <div className="panel-body">
        {vendors.length === 0 ? (
          <EmptyState
            compact
            title={`No ${plural.toLowerCase()} yet`}
            body={readOnly ? `Ask the owner to add your ${plural.toLowerCase()}.` : `The manufacturers and suppliers you buy from, with a phone number and contact for each.`}
            action={readOnly ? undefined : { label: `Add a ${one}`, onClick: openAdd }}
            testId="vendors-empty"
          />
        ) : (
          <>
            <div className="vendors-toolbar">
              <input type="search" aria-label={`Search ${plural.toLowerCase()}`} placeholder="Search by name, type, city or contact" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(PAGE); }} />
              {inactiveCount > 0 && (
                <label><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} style={{ width: 18, height: 18 }} /> Show inactive ({inactiveCount})</label>
              )}
              {!readOnly && <button type="button" className="button primary" onClick={openAdd} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}><Plus size={15} strokeWidth={1.75} />Add a {one}</button>}
            </div>
            {shown.length === 0 ? <p className="field-hint">No {plural.toLowerCase()} match “{query}”.</p> : (
              <ul className="vendor-list">
                {shown.slice(0, visible).map((vendor) => (
                  <li key={vendor.vendorId} className={`vendor-row${vendor.active ? "" : " vendor-row--inactive"}`}>
                    <div className="vendor-row__main">
                      <strong>
                        {vendor.name}
                        {vendor.type && <span className="tag" style={{ marginLeft: 6 }}>{vendor.type}</span>}
                        {vendor.provenance?.origin === "luxor-sample" && <ExampleTag />}
                        {!vendor.active && <span className="tag" style={{ marginLeft: 6 }}>Inactive</span>}
                      </strong>
                      {cityState(vendor) && <span className="vendor-row__line">{cityState(vendor)}</span>}
                      {vendor.phone && <span className="vendor-row__line"><a href={`tel:${vendor.phone}`}>{displayPhone(vendor.phone)}</a></span>}
                      {vendor.contactName && <span className="vendor-row__line">Contact: {vendor.contactName}</span>}
                    </div>
                    {!readOnly && <button type="button" className="button" aria-label={`Edit ${vendor.name}`} onClick={() => { setError(null); setEditing({ vendor, draft: draftOf(vendor) }); }}>Edit</button>}
                  </li>
                ))}
              </ul>
            )}
            {shown.length > visible && (
              <p style={{ margin: "12px 0 0" }}><button type="button" className="button" style={{ minHeight: 44 }} onClick={() => setVisible((count) => count + PAGE)}>Show more ({shown.length - visible} left)</button></p>
            )}
          </>
        )}
      </div>

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing.vendor ? `Edit ${editing.vendor.name}` : `Add a ${one}`}>
          <div className="vendor-sheet">
            <FormField label="Name"><input value={editing.draft.name} maxLength={120} onChange={set("name")} /></FormField>
            <FormField label="Type" hint="For example Manufacturer, Supplier or Subcontractor."><input value={editing.draft.type} maxLength={60} onChange={set("type")} /></FormField>
            <FormField label="Contact name"><input value={editing.draft.contactName} maxLength={120} onChange={set("contactName")} /></FormField>
            <FormField label="Phone"><input type="tel" inputMode="tel" autoComplete="off" value={editing.draft.phone} maxLength={40} onChange={set("phone")} /></FormField>
            <FormField label="Email"><input type="email" inputMode="email" autoComplete="off" value={editing.draft.email} maxLength={200} onChange={set("email")} /></FormField>
            <FormField label="Website"><input value={editing.draft.website} maxLength={200} onChange={set("website")} /></FormField>
            <FormField label="Address"><input value={editing.draft.address} maxLength={200} onChange={set("address")} /></FormField>
            <FormField label="City"><input value={editing.draft.city} maxLength={80} onChange={set("city")} /></FormField>
            <FormField label="State" hint="Two letters, like FL."><input value={editing.draft.state} maxLength={2} onChange={set("state")} /></FormField>
            <FormField label="Zip"><input value={editing.draft.zip} maxLength={20} inputMode="numeric" onChange={set("zip")} /></FormField>
            <FormField label="Notes"><textarea value={editing.draft.notes} maxLength={1000} onChange={set("notes")} /></FormField>
            {error && <p role="alert" className="team-control-error">{error}</p>}
            <div className="staff-sheet-actions">
              <button type="button" className="button primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              {editing.vendor && editing.vendor.active && (
                <button type="button" className="button" disabled={saving} onClick={() => { if (window.confirm(`Remove ${editing.vendor?.name}? It moves to Inactive and can be brought back.`)) void setActive(editing.vendor as Vendor, false); }}>Remove</button>
              )}
              {editing.vendor && !editing.vendor.active && (
                <button type="button" className="button" disabled={saving} onClick={() => void setActive(editing.vendor as Vendor, true)}>Make active again</button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}
