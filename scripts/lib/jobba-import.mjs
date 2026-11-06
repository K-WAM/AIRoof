import { createHash } from "node:crypto";

/** A history record's doc id. Jobba exports some rows with a blank ID (8 of Roof Doctors' 248 inspections, 2026-11-05);
 *  they all became "jobba-" and overwrote each other. A blank ID now gets a stable id from the row's content, so a re-run
 *  writes the same doc instead of a new copy. */
export function historyId(sourceId, row) {
  const id = String(sourceId ?? "").trim();
  return id ? `jobba-${id}` : `jobba-noid-${createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 12)}`;
}

/** @param {Uint8Array} buffer */
export function decodeCsvBuffer(buffer) {
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buffer);
  return text.replace(/^\uFEFF/, "");
}
/** @param {string} text @returns {Array<Record<string,string>>} */
export function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i+1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"' && !field) quoted = true;
    else if (c === ',') { row.push(field); field = ""; }
    else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ""; if (c === '\r' && text[i+1] === '\n') i++; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const keys = (rows.shift() ?? []).map(k => k.trim());
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(keys.map((k,i) => [k,r[i] ?? ""])));
}
/** @param {string} value */
export function parseMoney(value) { const s = (value ?? "").trim(); return (s.startsWith("(") ? -1 : 1) * (Number(s.replace(/[\s$(),]/g, "")) || 0); }
/** @param {string} value @param {string} tz */
export function parseUsDate(value, tz) {
  if (!value?.trim()) return undefined;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) throw new Error("Invalid date");
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const utc = Date.UTC(year, month-1, day, 12);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone:tz, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
  const parts = Object.fromEntries(fmt.formatToParts(utc).map(p => [p.type,p.value]));
  return utc - (Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second)) - utc);
}
// keep in step with scripts/backfill-customers.mjs and src/lib/customers/resolve.ts
/** @param {string | undefined} s */
export function normalizeName(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
/** @param {string | undefined} s */
export function digitsOnly(s) {
  return (s ?? "").replace(/\D/g, "");
}
/** @param {{name:string,phone?:string}} param0 */
export function matchKey({ name, phone }) {
  return `${normalizeName(name)}|${digitsOnly(phone).slice(-7)}`;
}
/** @param {Array<Record<string,string>>} rows */
export function mapCustomers(rows) {
  const result = new Map();
  for (const r of rows) { const name = r.Name?.trim(); if (!name) continue; const key = matchKey({name}); if (!result.has(key)) result.set(key,{name,kind:"commercial",matchKey:key,status:r.Status,sourceRef:r.ID || ""}); }
  return [...result.values()];
}
/** @param {Array<Record<string,string>>} rows */
export function mapProperties(rows) {
  const properties = new Map(); let cut = 0;
  for (const r of rows) { const key = matchKey({name:r.Owner}); const list = properties.get(key) ?? []; if (list.length >= 500) { cut++; continue; } list.push({name:r.Name || "",address:r["Property Address"] || "",city:r.City || "",state:r.State || "",sourceRef:r.ID || ""}); properties.set(key,list); }
  return { properties, cut };
}
/** @param {Array<Record<string,string>>} rows */
export function mapMaterials(rows) { const seen = new Set(); return rows.filter(r => r.Enabled === "Yes" && r.Name?.trim()).flatMap(r => { const name = r.Name.trim(), key = name.toLowerCase(); if (seen.has(key)) return []; seen.add(key); return [{name,unit:"each",unitPrice:parseMoney(r["Pkg Price"]?.trim() ? r["Pkg Price"] : r["Std Cost"])}]; }); }
/** @param {Array<Record<string,string>>} rows @param {string} tz */
export function mapInvoiceHistory(rows,tz) { return rows.map(r => ({id:historyId(r["Invoice ID"],r),sourceInvoiceId:r["Invoice ID"],issuedAt:parseUsDate(r.Date,tz),workName:r.Name,billTo:r["Bill To"],amount:parseMoney(r.Amount),tax:parseMoney(r.Tax),credits:parseMoney(r.Credits),amountDue:parseMoney(r["Amt Due"]),...(r.Paid ? {paidAt:parseUsDate(r.Paid,tz)} : {}),voided:r.Voided === "Yes",status:r.Status,source:"jobba"})); }
/** @param {Array<Record<string,string>>} rows @param {string} tz */
export function mapInspections(rows,tz) { return rows.map(r => ({id:historyId(r.ID,r),sourceId:r.ID,customerName:r.Customer,property:r.Property,address:r.Address,city:r.City,state:r.State,zip:r.Zip,status:r.Status,jobType:r["Job Type"],createdBy:r["Created By"],...(r.Due ? {dueAt:parseUsDate(r.Due,tz)} : {}),source:"jobba"})); }
