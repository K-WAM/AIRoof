"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { FormField } from "@/components/ui/FormField";
import { ExampleTag } from "@/components/ui/ExampleTag";
import { USER_TYPES, type UserTypeDef } from "@/lib/team/userTypes";
import type { Crew } from "@/types/library";
import type { StaffMember } from "@/types/staff";

// Edit one staff record (T-371b). Saving never sends anything; "Invite to the app" only opens the page's existing
// invite form, prefilled. In View as, every field is read-only (the server refuses the write as well).

const LANGUAGES: Array<{ id: "en" | "es" | "both"; label: string }> = [
  { id: "en", label: "English" }, { id: "es", label: "Spanish" }, { id: "both", label: "English and Spanish" },
];

export function StaffSheet({
  staff, crews, typeOptions, businessId, readOnly, onClose, onSaved, onInvite,
}: {
  staff: StaffMember;
  crews: Crew[];
  typeOptions: UserTypeDef[];
  businessId: string;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onInvite: (staff: StaffMember) => void;
}) {
  const [position, setPosition] = useState(staff.position ?? "");
  const [userType, setUserType] = useState<string>(staff.userType ?? "");
  const [crewId, setCrewId] = useState(staff.crewId ?? "");
  const [language, setLanguage] = useState<string>(staff.language ?? "");
  const [email, setEmail] = useState(staff.email ?? "");
  const [mobile, setMobile] = useState(staff.mobile ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeChoices = userType && !typeOptions.some((type) => type.id === userType)
    ? [...typeOptions, ...USER_TYPES.filter((type) => type.id === userType)]
    : typeOptions;
  const crewIsSample = !!staff.crewId && crewId === staff.crewId && staff.crewProvenance?.origin === "luxor-sample";

  const changes: Record<string, unknown> = {};
  if (position.trim() !== (staff.position ?? "")) changes.position = position.trim();
  if (userType && userType !== (staff.userType ?? "")) changes.userType = userType;
  if (crewId !== (staff.crewId ?? "")) changes.crewId = crewId;
  if (language !== (staff.language ?? "")) changes.language = language || null;
  if (email.trim() !== (staff.email ?? "")) changes.email = email.trim();
  if (mobile.trim() !== (staff.mobile ?? "")) changes.mobile = mobile.trim();
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    if (!dirty) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/company/staff/${encodeURIComponent(staff.staffId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...changes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "That could not be saved.");
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={staff.name} dirty={dirty && !readOnly}>
      <div className="staff-sheet">
        {readOnly && <p className="field-hint" role="status">You are viewing this account. Changes are turned off.</p>}
        <FormField label="Job title"><input value={position} readOnly={readOnly} maxLength={120} onChange={(event) => setPosition(event.target.value)} /></FormField>
        <FormField label="App access" hint="What they could do in the app once invited. Changing it here grants nothing.">
          <select value={userType} disabled={readOnly} onChange={(event) => setUserType(event.target.value)}>
            {!userType && <option value="">Not set</option>}
            {typeChoices.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </FormField>
        <FormField label="Crew" hint={crewIsSample ? "A guess made for the demo. Pick the right crew to confirm it." : undefined}>
          <select value={crewId} disabled={readOnly} onChange={(event) => setCrewId(event.target.value)}>
            <option value="">No crew</option>
            {crews.filter((crew) => crew.active !== false || crew.crewId === crewId).map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}
          </select>
        </FormField>
        {crewIsSample && <p className="staff-sheet-example"><ExampleTag /> This crew assignment is sample data.</p>}
        <FormField label="Language">
          <select value={language} disabled={readOnly} onChange={(event) => setLanguage(event.target.value)}>
            <option value="">Not set</option>
            {LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FormField>
        <FormField label="Email"><input type="email" inputMode="email" autoComplete="off" value={email} readOnly={readOnly} maxLength={200} onChange={(event) => setEmail(event.target.value)} /></FormField>
        <FormField label="Mobile"><input type="tel" inputMode="tel" autoComplete="off" value={mobile} readOnly={readOnly} maxLength={40} onChange={(event) => setMobile(event.target.value)} /></FormField>
        {error && <p role="alert" className="team-control-error">{error}</p>}
        <div className="staff-sheet-actions">
          {!readOnly && <button type="button" className="button primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>}
          {!readOnly && <button type="button" className="button secondary" disabled={saving} onClick={() => onInvite(staff)}>Invite to the app</button>}
          <button type="button" className="button" disabled={saving} onClick={onClose}>{readOnly ? "Close" : "Cancel"}</button>
        </div>
        {!readOnly && <p className="field-hint">Invite to the app opens the invite form with their name and email filled in. Nothing is sent until you press Send invite.</p>}
      </div>
    </Sheet>
  );
}
