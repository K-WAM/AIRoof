import { createHash } from "node:crypto";
import { digitsOnly, normalizeName } from "./jobba-import.mjs";

const NAME_MATCH_NOTE = "Matched by crew name; confirm in the Team form";
const ROUND_ROBIN_NOTE = "Crew membership guessed for the demo; confirm in the Team form";
const FIELD_TYPES = new Set(["technician", "foreman", "inspector"]);

const text = value => String(value ?? "").trim();
const enabled = row => text(row?.Enabled).toLowerCase() === "yes";
const fullNameOf = row => `${text(row?.["First Name"])} ${text(row?.["Last Name"])}`.replace(/\s+/g, " ").trim();
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const isBlank = value => value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);

export function staffIdFor(fullName) {
  return `jobba-staff-${createHash("sha256").update(normalizeName(fullName)).digest("hex").slice(0, 16)}`;
}

export function vendorIdFor(name) {
  return `jobba-vendor-${createHash("sha256").update(normalizeName(name)).digest("hex").slice(0, 16)}`;
}

export function e164(raw) {
  const digits = digitsOnly(raw);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function cleanEmail(raw) {
  const email = text(raw).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function userTypeFor(row, position, type, isForeman) {
  const primary = text(row?.Primary).toLowerCase();
  const job = position.toLowerCase();
  const kind = type.toLowerCase();
  if (primary === "yes") return "admin";
  if (job.includes("supervisor")) return "supervisor";
  if (job.includes("office manager")) return "office_admin";
  if (job.includes("manager")) return "manager";
  if (isForeman) return "foreman";
  if (kind.includes("inspector")) return "inspector";
  if (kind.includes("backoffice")) return "office";
  if (job.includes("technician") || kind.includes("service")) return "technician";
  return undefined;
}

export function mapStaff(contactRows, crewRows, existingCrews, now) {
  const notes = [];
  const crews = (existingCrews ?? [])
    .map(crew => ({ crewId: crew?.crewId, name: text(crew?.name), key: normalizeName(crew?.name) }))
    .filter(crew => crew.crewId && crew.name);
  const crewByName = new Map();
  for (const crew of crews) if (!crewByName.has(crew.key)) crewByName.set(crew.key, crew);

  const enabledCrews = (crewRows ?? []).filter(row => enabled(row) && text(row?.Name));
  const foremanNames = new Set(enabledCrews.map(row => normalizeName(row?.Foreman)).filter(Boolean));
  const leadCrewByPerson = new Map();
  for (const row of enabledCrews) {
    const foreman = normalizeName(row?.Foreman);
    if (!foreman || leadCrewByPerson.has(foreman)) continue;
    const crew = crewByName.get(normalizeName(row?.Name));
    if (crew) leadCrewByPerson.set(foreman, crew.crewId);
  }

  const staff = [];
  const byId = new Map();
  (contactRows ?? []).forEach((row, index) => {
    if (!enabled(row)) return;
    const name = fullNameOf(row);
    if (!name) return;
    const rowNumber = index + 2;
    if (/power\s*board/i.test(name)) {
      notes.push(`row ${rowNumber}: skipped (not a person)`);
      return;
    }
    const staffId = staffIdFor(name);
    if (byId.has(staffId)) {
      notes.push(`row ${rowNumber}: duplicate name skipped`);
      return;
    }
    const position = text(row?.Position);
    const type = text(row?.Type);
    const userType = userTypeFor(row, position, type, foremanNames.has(normalizeName(name)));
    const rawEmail = text(row?.Email);
    const email = cleanEmail(rawEmail);
    if (rawEmail && !email) notes.push(`row ${rowNumber}: email dropped (invalid)`);
    const mobile = e164(row?.["Mobile Phone"]);
    const record = {
      staffId,
      name,
      active: true,
      provenance: { origin: "client", source: "jobba:Company contacts.csv", addedAt: now },
      createdAt: now,
      updatedAt: now,
    };
    if (position) record.position = position;
    if (userType) record.userType = userType;
    if (email) record.email = email;
    if (mobile) record.mobile = mobile;
    const leadCrew = leadCrewByPerson.get(normalizeName(name));
    if (leadCrew) {
      record.crewId = leadCrew;
      record.crewLead = true;
    }
    staff.push(record);
    byId.set(staffId, record);
  });

  const fieldPeople = staff.filter(record => !record.crewId && FIELD_TYPES.has(record.userType)).sort(byName);
  const unmatched = [];
  for (const person of fieldPeople) {
    const crew = crewByName.get(normalizeName(person.name));
    if (!crew) {
      unmatched.push(person);
      continue;
    }
    person.crewId = crew.crewId;
    person.crewProvenance = { origin: "luxor-sample", source: "luxor:demo-fill", note: NAME_MATCH_NOTE, addedAt: now };
  }

  const leadCrewIds = new Set(staff.filter(record => record.crewLead && record.crewId && record.userType === "foreman").map(record => record.crewId));
  const guessCrews = crews.filter(crew => leadCrewIds.has(crew.crewId)).sort(byName);
  unmatched.forEach((person, index) => {
    if (!guessCrews.length) return;
    const crew = guessCrews[index % guessCrews.length];
    person.crewId = crew.crewId;
    person.crewProvenance = { origin: "luxor-sample", source: "luxor:demo-fill", note: ROUND_ROBIN_NOTE, addedAt: now };
  });

  return { staff, notes };
}

export function mapVendors(vendorRows, now) {
  const vendors = [];
  const seen = new Set();
  for (const row of vendorRows ?? []) {
    const name = text(row?.Name);
    if (!name) continue;
    const vendorId = vendorIdFor(name);
    if (seen.has(vendorId)) continue;
    seen.add(vendorId);
    const record = {
      vendorId,
      name,
      active: true,
      provenance: { origin: "client", source: "jobba:vendors.csv", addedAt: now },
      createdAt: now,
      updatedAt: now,
    };
    const type = text(row?.Type);
    const address = text(row?.Address);
    const city = text(row?.City);
    const state = text(row?.State).toUpperCase();
    const main = text(row?.Main);
    const contactName = text(row?.Contact);
    if (type) record.type = type;
    if (address) record.address = address;
    if (city) record.city = city;
    if (/^[A-Z]{2}$/.test(state)) record.state = state;
    const phone = e164(main) ?? main;
    if (phone) record.phone = phone;
    if (contactName) record.contactName = contactName;
    vendors.push(record);
  }
  return vendors;
}

export function planWrites(mapped, existingDocsById) {
  const lookup = id => (existingDocsById instanceof Map ? existingDocsById.get(id) : existingDocsById?.[id]);
  return (mapped ?? []).map(record => {
    const id = record.staffId ?? record.vendorId;
    if (!id) throw new Error("Mapped record has no id.");
    const existing = lookup(id);
    if (existing === undefined || existing === null) return { id, action: "create", fields: { ...record } };

    const fields = {};
    const existingCrewId = text(existing.crewId);
    const existingCrew = existing.crewProvenance;
    const sampleCrew = Boolean(existingCrew && existingCrew.origin === "luxor-sample");
    const incomingClientCrew = record.crewId !== undefined && record.crewProvenance === undefined;

    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || key === "linkedUid") continue;
      if (key === "crewId") {
        if (!existingCrewId) {
          fields.crewId = value;
        } else if (sampleCrew && incomingClientCrew && value !== existingCrewId) {
          fields.crewId = value;
          fields.crewProvenance = record.provenance;
        } else if (sampleCrew && incomingClientCrew) {
          fields.crewProvenance = record.provenance;
        }
        continue;
      }
      if (key === "crewProvenance") {
        if (!existingCrewId && record.crewId !== undefined) fields.crewProvenance = value;
        continue;
      }
      if (isBlank(existing[key])) fields[key] = value;
    }

    return Object.keys(fields).length ? { id, action: "fill", fields } : { id, action: "skip", fields: {} };
  });
}
