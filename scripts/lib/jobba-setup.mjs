import { createHash } from "node:crypto";
import { normalizeName, parseMoney } from "./jobba-import.mjs";

export const setupId = (kind, name) => `jobba-${kind}-${createHash("sha256").update(normalizeName(name)).digest("hex").slice(0, 16)}`;
const enabled = row => row.Enabled?.trim().toLowerCase() === "yes";
const unique = values => [...new Map(values.map(v => [normalizeName(v), v])).values()];
export function mapSetup(files) {
  const get = name => (files[name] ?? []).filter(enabled);
  const categories = get("Material Categories.csv");
  const units = get("Unit Of Measure.csv");
  const materials = [...get("material-items.csv"), ...get("Setup Material Items.csv")].filter(r => r.Name?.trim()).map(r => {
    const category = categories.find(c => normalizeName(c.Name) === normalizeName(r.Category));
    const unit = units.find(u => normalizeName(u.Name) === normalizeName(category?.UOM))?.Name ?? category?.UOM;
    return { name: r.Name.trim(), category: r.Category?.trim() || "", unit: unit?.trim() || "each", unitPrice: parseMoney(r["Pkg Price"]?.trim() ? r["Pkg Price"] : r["Std Cost"]) };
  });
  const crews = get("Crews.csv").filter(r => r.Name?.trim()).map(r => ({ crewId: setupId("crew", r.Name), name: r.Name.trim(), types: (r.Types || "").split(/[,;]/).map(t => t.trim()).filter(Boolean), source: "jobba", color: "#0f766e", active: true, foreman: r.Foreman?.trim() || "" }));
  const laborRates = get("Labor Types.csv").filter(r => r.Name?.trim() && /\b(h|hr|hrs|hour|hours|hourly)\b/i.test(r.UOM?.trim())).map(r => ({ role: r.Name.trim(), rate: parseMoney(r.Rate) }));
  const terms = get("Payment Terms.csv").map(r => ({ name: r.Name, dueDays: /^\d+$/.test(r["Payment due"]?.trim()) ? Number(r["Payment due"]) : null, discountRate: parseMoney((r["Discount rate"] || "").replace("%", "")), discountDays: r["Discount days"] }));
  const taxes = get("Tax Types.csv").filter(r => /^\d+(\.\d+)?%?$/.test(r["Tax Rate"]?.trim())).map(r => Number(r["Tax Rate"].replace("%", ""))).filter(n => n >= 0 && n <= 100);
  const findingCategories = unique(Object.entries(files).filter(([name]) => /^(Deficiency Types|Element Types|System Types|System Categories)( \(\d+\))?\.csv$/.test(name)).flatMap(([, rows]) => rows.filter(enabled).map(r => r.Name?.trim()).filter(Boolean)));
  return { crews, laborRates, materials: [...new Map(materials.map(m => [normalizeName(m.name), m])).values()], terms, ...(taxes.length === 1 ? { defaultTaxRate: taxes[0] } : {}), findingCategories };
}

/** Additive import: never replace reviewed fields or choose between multiple term defaults. */
export async function importSetup(db, biz, files, apply, now) {
  const mapped = mapSetup(files);
  console.log(JSON.stringify({ setup: { crews: mapped.crews.length, laborRates: mapped.laborRates.length, materials: mapped.materials.length, termChoices: mapped.terms.length, taxDefaultUnambiguous: mapped.defaultTaxRate !== undefined, findingCategories: mapped.findingCategories.length } }));
  if (!apply) return;
  const archiveRows = Object.entries(files).flatMap(([file, rows]) => rows.map((row, index) => ({ file, row, rowNumber: index + 1, id: `jobba-source-${createHash("sha256").update(`${file}:${index + 1}:${JSON.stringify(row)}`).digest("hex")}` })));
  const archive = [...new Map(archiveRows.map(r => [r.id, r])).values()];
  for (let i = 0; i < archive.length; i += 400) {
    const chunk = archive.slice(i, i + 400);
    await db.runTransaction(async tx => {
      const snaps = await tx.getAll(...chunk.map(r => biz.collection("jobbaSetup").doc(r.id)));
      snaps.forEach((snap, index) => { if (!snap.exists) tx.create(snap.ref, { file: chunk[index].file, rowNumber: chunk[index].rowNumber, fields: chunk[index].row, importedAt: now }); });
    });
  }
  const crewDocs = await biz.collection("crews").get();
  const members = await db.collection("businessUsers").where("businessId", "==", biz.id).get();
  const contacts = (files["Company contacts.csv"] ?? []).filter(enabled);
  for (const crew of mapped.crews) {
    const existing = crewDocs.docs.find(d => normalizeName(d.data().name) === normalizeName(crew.name));
    const ref = existing?.ref ?? biz.collection("crews").doc(crew.crewId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const { foreman: _foreman, ...fields } = crew;
      if (!snap.exists) tx.create(ref, { ...fields, createdAt: now });
      else if (!Object.hasOwn(snap.data(), "types")) tx.update(ref, { types: crew.types });
    });
    // A text foreman label is insufficient. Require an exported person and one existing account; never create one.
    if (crew.foreman && contacts.some(c => normalizeName(`${c["First Name"]} ${c["Last Name"]}`) === normalizeName(crew.foreman))) {
      const people = members.docs.filter(m => normalizeName(m.data().displayName) === normalizeName(crew.foreman) && m.data().active !== false && ["owner", "staff", "crew"].includes(m.data().role));
      if (people.length === 1) await db.runTransaction(async tx => { const snap = await tx.get(people[0].ref); if (!Object.hasOwn(snap.data(), "crewId")) tx.update(snap.ref, { crewId: ref.id }); });
    }
  }
  await db.runTransaction(async tx => {
    const pricingRef = biz.collection("library").doc("pricing"), catalogRef = biz.collection("library").doc("workCatalog");
    const [pricing, catalog, business] = await Promise.all([tx.get(pricingRef), tx.get(catalogRef), tx.get(biz)]);
    const old = pricing.data() ?? {}, materialRows = [...(old.materials ?? [])], laborRows = [...(old.laborRates ?? [])];
    for (const item of mapped.materials) {
      const found = materialRows.find(m => normalizeName(m.name) === normalizeName(item.name));
      if (!found) materialRows.push(item);
      else { if (!Object.hasOwn(found, "category")) found.category = item.category; if (!Object.hasOwn(found, "unit")) found.unit = item.unit; if (!Object.hasOwn(found, "importedUnit")) found.importedUnit = item.unit; }
    }
    for (const rate of mapped.laborRates) if (!laborRows.some(r => normalizeName(r.role) === normalizeName(rate.role))) laborRows.push(rate);
    tx.set(pricingRef, { materials: materialRows, laborRates: laborRows, ...(!Object.hasOwn(old, "defaultTaxRate") && mapped.defaultTaxRate !== undefined ? { defaultTaxRate: mapped.defaultTaxRate } : {}) }, { merge: true });
    tx.set(catalogRef, { items: catalog.data()?.items ?? [], categories: unique([...(catalog.data()?.categories ?? []), ...mapped.findingCategories]) }, { merge: true });
    const prefs = business.data()?.billingPrefs ?? {};
    if (!Object.hasOwn(prefs, "importedTerms")) {
      const valid = mapped.terms.filter(t => t.dueDays !== null && t.dueDays <= 120);
      tx.set(biz, { billingPrefs: { ...prefs, importedTerms: mapped.terms, ...(!Object.hasOwn(prefs, "dueDays") && valid.length === 1 ? { dueDays: valid[0].dueDays } : {}) } }, { merge: true });
    }
  });
}
