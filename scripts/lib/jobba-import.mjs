import { createHash } from "node:crypto";

/** A history record's doc id. Jobba exports some rows with a blank ID (8 of Roof Doctors' 248 inspections, 2026-11-05);
 *  they all became "jobba-" and overwrote each other. A blank ID now gets a stable id from the row's content, so a re-run
 *  writes the same doc instead of a new copy. */
export function historyId(sourceId, row) {
  const id = String(sourceId ?? "").trim();
  return id ? `jobba-${id}` : `jobba-noid-${createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 12)}`;
}

// Windows-1252 by hand: Node 20's TextDecoder("windows-1252") decodes as Latin-1, turning 0x80-0x9F (curly quotes,
// dashes, the euro sign) into control characters; Node 22+ follows the WHATWG table. Same result on every Node.
const CP1252_HIGH = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
  0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
/** @param {Uint8Array} bytes */
function decodeWindows1252(bytes) {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b <= 0x9F ? CP1252_HIGH[b - 0x80] : b);
  return out;
}

/** @param {Uint8Array} buffer */
export function decodeCsvBuffer(buffer) {
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("\uFFFD")) text = decodeWindows1252(buffer);
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
export function mapInspections(rows,tz) { return rows.map(r => ({id:historyId(r.ID,r),kind:"inspection",sourceId:r.ID,customerName:r.Customer,property:r.Property,address:r.Address,city:r.City,state:r.State,zip:r.Zip,status:r.Status,jobType:r["Job Type"],createdBy:r["Created By"],...(r.Due ? {dueAt:parseUsDate(r.Due,tz)} : {}),source:"jobba"})); }

/** Work orders share history, but have a separate id namespace, including blank source IDs. */
export function mapServices(rows, tz) {
  return rows.map(r => ({
    id: historyId(r["WO ID"], r).replace(/^jobba-/, "jobba-wo-"),
    sourceId: r["WO ID"]?.trim() || "", kind: "work-order", source: "jobba",
    customerName: r.Customer || "", property: r.Property || "", address: r.Address || "",
    city: r.City || "", state: r.State || "", zip: r.Zip || "", status: r.Status || "",
    jobType: r["Job Type"] || "", createdBy: r["Created By"] || "",
    description: r.Description || "", dealId: r["Deal ID"] || "", type: r.Type || "",
    ...(r.Due?.trim() ? { dueAt: parseUsDate(r.Due, tz) } : {}),
  }));
}
