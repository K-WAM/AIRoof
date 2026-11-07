// Sample work for a client's blank screens (T-376): a few jobs, a phone booking and two requests at the client's REAL
// properties, on their REAL crews, priced from their OWN catalog, every record marked provenance.origin "luxor-sample"
// (src/types/provenance.ts) so the screens show an "Example" tag and Admin -> Clients -> Edit -> Sample data removes
// it all. Pure: no Firestore, no clock (pass `now`). The writer is scripts/seed-sample-work.mjs.
//
// Never copied from the client's records: phone numbers (sample requests use 555-01xx, reserved for fiction) and
// emails (none). Never written: the customer records themselves (jobs only point at them).
//
// The job projection fields (parsed + the legacy field-log mirror + lastFieldUpdate) are computed here in plain JS for
// these simple notes. src/lib/import/__tests__/sample-work.test.ts checks them against the app's own buildProjection,
// parsedToFieldLog and latestFieldUpdate, so a change there fails that test instead of drifting silently.

export const SAMPLE_WORK_SOURCE = "luxor:sample-work";
export const SAMPLE_NOTE = "Sample work added by Luxor so Jobs, Calendar and Requests show how the app works. Remove it from Admin -> Clients -> Edit -> Sample data.";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------- dates in the business's timezone ----------

const formatters = new Map();
function fmt(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat("en-CA", { timeZone, ...options }));
  return formatters.get(key);
}
/** "YYYY-MM-DD" of `ms` in `timeZone` (same as the app's dayKey). */
export function localDateKey(ms, timeZone) {
  return fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}
function localMinutes(ms, timeZone) {
  const parts = Object.fromEntries(fmt(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map((p) => [p.type, p.value]));
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}
function offsetMs(utcMs, timeZone) {
  const parts = Object.fromEntries(fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(utcMs).map((p) => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)) - utcMs;
}
/** Wall-clock time on a local date -> UTC ms (DST-correct). */
export function zonedTime(dateKey, hhmm, timeZone) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
}
function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}
function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}
/** Open unless the business's hours say Closed (or leave the day out). No hours at all = Monday to Friday. */
export function isBusinessDay(dateKey, businessHours) {
  const day = weekdayOf(dateKey);
  if (!businessHours || typeof businessHours !== "object" || Object.keys(businessHours).length === 0) return day !== "Saturday" && day !== "Sunday";
  const value = String(businessHours[day] ?? "").trim();
  return value !== "" && !/closed/i.test(value);
}
function stepBusinessDays(dateKey, businessHours, direction, count) {
  const out = [];
  let cursor = dateKey;
  for (let guard = 0; out.length < count && guard < 60; guard++) {
    cursor = addDays(cursor, direction);
    if (isBusinessDay(cursor, businessHours)) out.push(cursor);
  }
  if (out.length < count) throw new Error("The business hours leave too few open days to lay out sample work.");
  return out;
}

/**
 * The day the samples are laid out around ("today" in the story). Default: today if it is an open day and before 5 pm
 * local, otherwise the next open day — so everything that "already happened" (the previous open day's notes) is in
 * the past. A given day must be today or later, and its previous open day must not be after today.
 * @param {{ now: number, timeZone: string, businessHours?: Record<string, string>, day?: string }} options
 * @returns {string}
 */
export function chooseDemoDay({ now, timeZone, businessHours, day }) {
  const today = localDateKey(now, timeZone);
  if (day !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || addDays(day, 0) !== day) throw new Error("--day must be YYYY-MM-DD.");
    if (!isBusinessDay(day, businessHours)) throw new Error(`${day} is not an open day for this business.`);
    if (day < today) throw new Error("--day cannot be in the past.");
    const [previous] = stepBusinessDays(day, businessHours, -1, 1);
    if (previous > today) throw new Error(`--day ${day} is too far ahead: its previous open day (${previous}) has not happened yet.`);
    return day;
  }
  if (isBusinessDay(today, businessHours) && localMinutes(now, timeZone) < 17 * 60) return today;
  return stepBusinessDays(today, businessHours, 1, 1)[0];
}

// ---------- the client's own catalog, crews and properties ----------

const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

function catalog(materials, laborRates) {
  const byName = new Map((materials ?? []).filter((m) => m && m.name).map((m) => [norm(m.name), m]));
  const rates = new Map((laborRates ?? []).filter((r) => r && r.name).map((r) => [norm(r.name), r]));
  // Generic keywords only: a client's own item names and prices are read from its catalog at seed time and never live
  // in this repo (client data stays in git-ignored client-resources/). Exact label first, then the first catalog entry
  // whose name contains the keyword, else the generic label at a stand-in price.
  const find = (map, keyword, label) => map.get(norm(label)) ?? [...map.entries()].find(([key]) => key.includes(norm(keyword)))?.[1];
  return {
    material(keyword, label, fallbackPrice) {
      const hit = find(byName, keyword, label);
      const price = Number(hit?.unitPrice);
      return { name: hit?.name ?? label, unitPrice: Number.isFinite(price) && price > 0 ? price : fallbackPrice, unit: hit?.unit || "each" };
    },
    rate(keyword, label) {
      const hit = find(rates, keyword, label);
      const value = Number(hit?.rate);
      return { name: hit?.name ?? label, rate: Number.isFinite(value) && value > 0 ? value : 85 };
    },
  };
}

/** The client's finding category whose name contains `keyword` (any wording), else the generic fallback. */
function pickCategory(categories, keyword, fallback) {
  const list = (categories ?? []).map(String);
  return list.find((c) => norm(c).includes(norm(keyword))) ?? fallback;
}

/** Work crews in a useful order: the service crew, the crews, and a one-person row (an inspector's) for inspections. */
function crewRoles(crews) {
  const work = (crews ?? []).filter((c) => c && c.crewId && c.active !== false && c.kind !== "inspector");
  const service = work.find((c) => /service/i.test(c.name ?? "")) ?? work[0] ?? null;
  const person = work.find((c) => c !== service && !/crew|service|team/i.test(c.name ?? "")) ?? null;
  const teams = work.filter((c) => c !== service && c !== person);
  const team = (i) => (teams.length ? teams[i % teams.length] : service);
  return { service, inspection: person ?? service, team };
}

function propertyOf(customer) {
  const props = Array.isArray(customer.properties) ? customer.properties : [];
  const p = props.find((x) => x && String(x.address ?? "").trim()) ?? null;
  if (p) {
    const street = String(p.address).trim();
    const tail = [String(p.city ?? "").trim(), [String(p.state ?? "").trim(), String(p.zip ?? "").trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { label: String(p.name ?? "").trim() || street, address: tail ? `${street}, ${tail}` : street };
  }
  const address = String(customer.address ?? "").trim();
  return address ? { label: address.split(",")[0], address } : null;
}

/** Customers with a property address, most past work first, one per organisation (first two words of the name). */
export function pickProperties(customers, count) {
  const seen = new Set();
  const picked = [];
  const sorted = [...(customers ?? [])]
    .filter((c) => c && c.customerId && c.name && propertyOf(c))
    .sort((a, b) => (b.workOrders ?? 0) - (a.workOrders ?? 0) || String(a.name).localeCompare(String(b.name)));
  for (const c of sorted) {
    const stem = norm(c.name).replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).join(" ");
    if (seen.has(stem)) continue;
    seen.add(stem);
    picked.push({ customerId: c.customerId, name: String(c.name).trim(), ...propertyOf(c) });
    if (picked.length === count) break;
  }
  if (picked.length === 0) throw new Error("No customer has a property address to put sample work at.");
  // A small account reuses its properties rather than inventing new ones.
  for (let i = 0; picked.length < count; i++) picked.push(picked[i]);
  return picked;
}

// ---------- job projection (mirrors src/lib/jobs/projection.ts for these simple notes; see the header) ----------

function projectionOf(updates, timeZone) {
  const sorted = [...updates].sort((a, b) => a.createdAt - b.createdAt);
  const materials = [];
  const matAt = new Map();
  const labor = [];
  const issues = [];
  const seenIssues = new Set();
  for (const u of sorted) {
    for (const m of u.parsed.materials) {
      const key = norm(m.item);
      const qty = Number(m.quantity) || 0;
      if (matAt.has(key)) materials[matAt.get(key)].quantity += qty;
      else { matAt.set(key, materials.length); materials.push({ item: m.item, quantity: qty, unit: m.unit }); }
    }
    for (const l of u.parsed.labor) labor.push({ ...l, source: "voice", dayKey: localDateKey(u.createdAt, timeZone), workerKey: `name:${norm(l.description)}` });
    for (const i of u.parsed.issues) {
      const key = norm(i.description);
      if (seenIssues.has(key)) continue;
      seenIssues.add(key);
      issues.push(i);
    }
  }
  const timeline = sorted.flatMap((u) => u.parsed.timeline.map((t) => ({ ...t, dateMs: u.createdAt })));
  const parsed = { timeline, materials: materials.map((m) => ({ item: m.item, quantity: String(m.quantity), unit: m.unit })), labor, issues, invoiceSuggestions: [] };
  const laborEntries = labor.map((l) => ({ workerName: l.description, timeIn: l.arrivalTime, timeOut: l.departureTime, hours: l.hours }));
  const newest = sorted[sorted.length - 1];
  const text = (newest.rawTextEn || newest.rawText).replace(/\s+/g, " ").trim();
  return {
    parsed,
    materials: parsed.materials.map((m) => ({ name: m.item, quantity: Number(m.quantity) || 0, unit: m.unit ?? "units" })),
    laborEntries,
    timelineEvents: timeline.map((t) => ({ eventType: "other", time: t.time, notes: t.description })),
    fieldNotes: issues.map((i) => `[${i.severity.toUpperCase()}] ${i.description}`),
    totalLaborHours: laborEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0),
    lastFieldUpdate: { at: newest.createdAt, ...(newest.submittedBy ? { by: newest.submittedBy } : {}), text: text.length > 160 ? `${text.slice(0, 157)}…` : text },
  };
}

// ---------- the sample set ----------

const empty = () => ({ timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] });

/**
 * @param {object} input
 * @param {number} input.now  ms
 * @param {string} input.businessId
 * @param {string} input.timeZone
 * @param {Record<string,string>} [input.businessHours]
 * @param {string} [input.day]  YYYY-MM-DD; default chooseDemoDay()
 * @param {Array<{crewId:string,name?:string,active?:boolean,kind?:string}>} input.crews
 * @param {Array<{customerId:string,name:string,address?:string,properties?:Array<object>,workOrders?:number}>} input.customers
 * @param {Array<{name:string,unitPrice?:number,unit?:string}>} [input.materials]
 * @param {Array<{name:string,rate?:number}>} [input.laborRates]
 * @param {string[]} [input.categories]  finding categories (Library)
 * @param {Array<{id:string,isDefault?:boolean}>} [input.companies]  billingCompanies; 2+ = jobs carry a companyId
 * @param {string[]} input.jobIds  ids for the 7 sample jobs, in order (the writer hands these out from jobCounter)
 */
export function buildSampleWork(input) {
  const { now, businessId, timeZone } = input;
  if (!Array.isArray(input.jobIds) || input.jobIds.length < 7) throw new Error("buildSampleWork needs 7 job ids.");
  const hours = input.businessHours;
  const D = chooseDemoDay({ now, timeZone, businessHours: hours, day: input.day });
  const [P1, P2, P3, P4] = stepBusinessDays(D, hours, -1, 4);
  const [N1, N2] = stepBusinessDays(D, hours, 1, 2);
  // Anything that "already happened" is kept at least a minute in the past.
  const past = (dateKey, hhmm) => Math.min(zonedTime(dateKey, hhmm, timeZone), now - 60_000);
  const at = (dateKey, hhmm) => zonedTime(dateKey, hhmm, timeZone);
  const provenance = { origin: "luxor-sample", source: SAMPLE_WORK_SOURCE, note: SAMPLE_NOTE, addedAt: now };

  const cat = catalog(input.materials, input.laborRates);
  const crews = crewRoles(input.crews);
  const places = pickProperties(input.customers, 10);
  const companies = (input.companies ?? []).filter((c) => c && c.id);
  const defaultCompany = companies.find((c) => c.isDefault) ?? companies[0];
  const otherCompany = companies.find((c) => c !== defaultCompany);
  const companyFor = (useOther) => (companies.length >= 2 ? { companyId: (useOther && otherCompany ? otherCompany : defaultCompany).id } : {});

  const tile = cat.material("roof tile", "Roof tile", 25);
  const mortar = cat.material("mortar", "Tile mortar", 22);
  const mastic = cat.material("mastic", "Silicone mastic", 120);
  const flashingCement = cat.material("flashing cement", "Flashing cement", 80);
  const drainBasket = cat.material("drain basket", "Drain basket", 90);
  const pourable = cat.material("pourable", "Pourable sealer", 200);
  const elbow = cat.material("downspout elbow", "Downspout elbow", 15);
  const disposal = cat.material("disposal", "Disposal", 25);
  const foreman = cat.rate("foreman", "Foreman");
  const mechanic = cat.rate("roof mechanic", "Roof mechanic");
  const serviceRoofer = cat.rate("service roofer", "Service roofer");

  const jobs = [];
  const base = (i, place, extra) => ({
    jobId: input.jobIds[i], businessId, clientName: place.name, customerId: place.customerId, address: place.address,
    propertyType: "commercial", provenance, ...extra,
  });
  const schedule = (crew, dateKey, from, to, confirmed) => (crew
    ? { assignedCrewId: crew.crewId, scheduledStart: at(dateKey, from), scheduledEnd: at(dateKey, to), crewConfirmed: confirmed }
    : {});
  const note = (dateKey, hhmm, by, rawText, parsed, es) => ({
    createdAt: past(dateKey, hhmm), submittedBy: by, rawText, language: es ? "es" : "en",
    ...(es ? { rawTextEn: es } : {}), parsed: { ...empty(), ...parsed, ...(es ? { transcriptEn: es, sourceLanguage: "es" } : {}) },
  });
  const withNotes = (doc, notes) => {
    const updates = notes.map((n, k) => ({ updateId: `sample-note-${k + 1}`, ...n }));
    const projection = projectionOf(updates, timeZone);
    const last = updates[updates.length - 1].createdAt;
    return { doc: { ...doc, ...projection, updatedAt: Math.max(doc.updatedAt, last) }, updates };
  };

  // 1. Leak repair in progress (yesterday), three crew notes — one in Spanish. Add today's note in the demo.
  {
    const place = places[0], crew = crews.service, by = crew?.name ?? "Service crew";
    const notes = [
      note(P1, "08:10", by, "On site at 8. Water stains on two ceiling tiles in the second-floor hallway. Going up to find the source.", {
        timeline: [{ time: "8:00 AM", description: "Crew on site; water stains on two ceiling tiles in the second-floor hallway." }],
        issues: [{ description: "Water stains on two ceiling tiles in the second-floor hallway", severity: "medium" }],
      }),
      note(P1, "11:40", by, "Encontramos 14 tejas rotas alrededor del ducto del aire acondicionado y la membrana de abajo está mojada. Cambiamos las tejas y sellamos el ducto con mastique.", {
        timeline: [{ time: "11:40 AM", description: "Replaced the broken tiles around the AC duct and sealed the duct." }],
        materials: [{ item: tile.name, quantity: "14", unit: "each" }, { item: mortar.name, quantity: "2", unit: "each" }, { item: mastic.name, quantity: "1", unit: "each" }],
        issues: [{ description: "14 broken tiles around the AC duct; wet underlayment below", severity: "high", resolution: "Replaced the tiles and sealed the duct with mastic." }],
      }, "We found 14 broken tiles around the AC duct and the underlayment below is wet. We replaced the tiles and sealed the duct with mastic."),
      note(P1, "14:50", by, `Leaving at 3. ${foreman.name} and ${mechanic.name.toLowerCase()}, 7 hours each. We'll check the hallway again after the next rain.`, {
        timeline: [{ time: "3:00 PM", description: "Crew left the site; check the hallway again after the next rain." }],
        labor: [
          { description: foreman.name, hours: 7, arrivalTime: "8:00 AM", departureTime: "3:00 PM" },
          { description: mechanic.name, hours: 7, arrivalTime: "8:00 AM", departureTime: "3:00 PM" },
        ],
      }),
    ];
    jobs.push(withNotes(base(0, place, {
      title: `Roof leak repair — ${place.label}`, status: "in_progress", serviceType: "Roof leak repair",
      notes: "Facilities reported water through the ceiling in the second-floor hallway after the storm. Time and materials.",
      ...companyFor(false), ...schedule(crew, P1, "08:00", "15:00", true),
      statusHistory: [{ status: "in_progress", at: past(P1, "08:10") }],
      createdAt: past(P2, "15:20"), updatedAt: past(P2, "15:20"),
    }), notes));
  }

  // 2. Inspection done, three priced findings: build the quote from them in the demo (issued under the 2nd company).
  {
    const place = places[1], crew = crews.inspection;
    const line = (description, quantity, unit, unitPrice, kind) => ({ description, quantity, unit, unitPrice, kind });
    const addedAt = past(P2, "10:50");
    const findings = [
      { findingId: "sample-finding-1", category: pickCategory(input.categories, "broken tile", "Tile"), problem: "Broken and slipped tiles on the north slope",
        solution: "Replace about 20 tiles and re-set them in mortar.", severity: "medium", note: "North slope, above the main entrance.",
        lines: [line(mechanic.name, 6, "hr", mechanic.rate, "labor"), line(tile.name, 20, tile.unit, tile.unitPrice, "material"), line(mortar.name, 3, mortar.unit, mortar.unitPrice, "material")] },
      { findingId: "sample-finding-2", category: pickCategory(input.categories, "scupper", "Drains"), problem: "Clogged scupper on the flat section",
        solution: "Clear the debris, flush the drain line and re-seal the scupper box.", severity: "high", note: "About 2 inches of water ponding at the scupper.",
        lines: [line(serviceRoofer.name, 2, "hr", serviceRoofer.rate, "labor"), line(flashingCement.name, 1, flashingCement.unit, flashingCement.unitPrice, "material"), line(drainBasket.name, 1, drainBasket.unit, drainBasket.unitPrice, "material")] },
      { findingId: "sample-finding-3", category: pickCategory(input.categories, "pitch pan", "Flashing"), problem: "Pitch pan sealant has shrunk at the AC stand",
        solution: "Clean the pans and refill them with pourable sealer.", severity: "low",
        lines: [line(mechanic.name, 2, "hr", mechanic.rate, "labor"), line(pourable.name, 1, pourable.unit, pourable.unitPrice, "material")] },
    ].map((f) => ({ ...f, includeInReport: true, includeInQuote: true, addedAt }));
    const notes = [note(P2, "10:55", "Inspector", "Inspection done. Broken tiles on the north slope, a clogged scupper on the flat section, and the pitch pan sealant at the AC stand has shrunk. Findings added.", {
      timeline: [{ time: "11:00 AM", description: "Inspection finished; three findings recorded." }],
    })];
    jobs.push(withNotes(base(1, place, {
      title: `Annual roof inspection — ${place.label}`, status: "inspection", serviceType: "Roof inspection",
      notes: "Yearly inspection under the maintenance agreement. Send the report and a proposal for anything found.",
      ...companyFor(true), ...schedule(crew, P2, "09:00", "11:00", true), findings,
      createdAt: past(P3, "10:00"), updatedAt: past(P3, "10:00"),
    }), notes));
  }

  // 3. Gutter cleaning finished: create and send the invoice in the demo.
  {
    const place = places[2], crew = crews.team(0), by = crew?.name ?? "Crew";
    const notes = [
      note(P3, "08:05", by, "Started at 8 on building 1. Gutters are full of leaves and roof debris.", {
        timeline: [{ time: "8:00 AM", description: "Started the gutter cleaning on building 1." }],
      }),
      note(P3, "14:10", by, `All gutters cleaned and flushed. Replaced three cracked downspout elbows on building 4. ${foreman.name} and ${serviceRoofer.name.toLowerCase()}, 6 hours each.`, {
        timeline: [{ time: "2:00 PM", description: "All gutters cleaned and flushed; three downspout elbows replaced." }],
        materials: [{ item: elbow.name, quantity: "3", unit: "each" }, { item: disposal.name, quantity: "1", unit: "each" }],
        labor: [
          { description: foreman.name, hours: 6, arrivalTime: "8:00 AM", departureTime: "2:00 PM" },
          { description: serviceRoofer.name, hours: 6, arrivalTime: "8:00 AM", departureTime: "2:00 PM" },
        ],
        issues: [{ description: "Three cracked downspout elbows on building 4", severity: "low", resolution: "Replaced." }],
      }),
    ];
    jobs.push(withNotes(base(2, place, {
      title: `Gutter cleaning — ${place.label}`, status: "complete", serviceType: "Gutter repair",
      notes: "Semi-annual gutter cleaning on all buildings.",
      ...companyFor(false), ...schedule(crew, P3, "08:00", "14:00", true),
      reportNotes: "Cleaned and flushed all gutters and downspouts. Replaced three cracked downspout elbows on building 4. Debris hauled away.",
      completedAt: past(P3, "14:30"),
      statusHistory: [{ status: "in_progress", at: past(P3, "08:05") }, { status: "complete", at: past(P3, "14:30") }],
      createdAt: past(P4, "09:30"), updatedAt: past(P3, "14:30"),
    }), notes));
  }

  // 4-6. This week's schedule: today's maintenance (confirmed), two more waiting for "Confirm + email crew".
  const planned = [
    { i: 3, place: places[3], crew: crews.team(1), day: D, from: "08:00", to: "12:00", confirmed: true, title: "6-month roof maintenance", serviceType: "Preventive maintenance",
      notes: "6-month preventive maintenance: remove debris, clear drains and scuppers, check flashings and sealants, photos of anything that needs a proposal." },
    { i: 4, place: places[4], crew: crews.service, day: N1, from: "09:00", to: "12:00", confirmed: false, title: "Leak investigation", serviceType: "Roof leak repair",
      notes: "Tenant reports a drip near the lobby skylight when it rains hard. Water-test the skylight curb." },
    { i: 5, place: places[5], crew: crews.team(2), day: N2, from: "08:00", to: "16:00", confirmed: false, title: "Flat roof coating", serviceType: "Flat roof repair",
      notes: "Approved proposal: clean and coat the flat roof over the kitchen with silicone coating." },
  ];
  for (const p of planned) {
    jobs.push({ doc: base(p.i, p.place, {
      title: `${p.title} — ${p.place.label}`, status: "open", serviceType: p.serviceType, notes: p.notes,
      ...companyFor(false), ...schedule(p.crew, p.day, p.from, p.to, p.confirmed),
      createdAt: past(P1, "09:15"), updatedAt: past(P1, "09:15"),
    }), updates: [] });
  }

  // 7. Not scheduled yet: drag it onto a crew on the Calendar.
  jobs.push({ doc: base(6, places[6], {
    title: `Tile roof repair — ${places[6].label}`, status: "open", serviceType: "Tile roof repair",
    notes: "Cracked tiles reported by the property manager after the last storm. Schedule when a crew is free.",
    ...companyFor(false), createdAt: past(P1, "10:30"), updatedAt: past(P1, "10:30"),
  }), updates: [] });

  // Requests: a phone booking to confirm, an urgent after-hours leak, a proposal request.
  const request = (place, phone, fields) => ({
    businessId, callerName: place.name, callerPhone: phone, address: place.address, customerId: place.customerId, provenance, ...fields,
  });
  const appointments = [{ id: "sample-booking-1", doc: request(places[7], "+15615550134", {
    appointmentId: "sample-booking-1", serviceType: "Roof leak repair",
    startTime: at(N1, "13:00"), endTime: at(N1, "14:00"), calendarProvider: "mock", status: "requested", pendingConfirmation: true,
    notes: "Caller from the facilities office: water coming through the ceiling of the media center after the last rain. Wants someone out this week.",
    intake: { "roof-type": "Flat", "insurance-claim": "no", "active-leak": "yes" },
    createdAt: past(P1, "16:20"), updatedAt: past(P1, "16:20"),
  }) }];
  const leads = [
    { id: "sample-request-1", doc: request(places[8], "+19545550178", {
      leadId: "sample-request-1", serviceRequested: "Emergency leak repair", urgency: "urgent", escalated: true,
      escalationReason: "Active leak inside the building", status: "new",
      notes: "Called after hours: water dripping inside near the main entrance, buckets out. Asked for a crew first thing in the morning.",
      intake: { "roof-type": "Not sure", "insurance-claim": "no", "active-leak": "yes" },
      createdAt: past(P1, "17:40"), updatedAt: past(P1, "17:40"),
    }) },
    { id: "sample-request-2", doc: request(places[9], "+15615550119", {
      leadId: "sample-request-2", serviceRequested: "Roof replacement", urgency: "normal", status: "new",
      notes: "The board wants a proposal to re-roof the clubhouse before hurricane season. Asked for a site visit and a written proposal.",
      intake: { "roof-type": "Tile", "insurance-claim": "no", "active-leak": "no" },
      createdAt: past(P1, "11:05"), updatedAt: past(P1, "11:05"),
    }) },
  ];

  return { day: D, previousDay: P1, jobs, appointments, leads };
}

/** One line per record for the dry run (no phone numbers). */
export function describeSampleWork(work, timeZone, crews) {
  const crewName = new Map((crews ?? []).map((c) => [c.crewId, c.name ?? c.crewId]));
  const when = (ms) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
  const lines = [`Demo day: ${work.day} (the previous open day is ${work.previousDay})`];
  for (const { doc, updates } of work.jobs) {
    const slot = doc.scheduledStart ? `${crewName.get(doc.assignedCrewId) ?? doc.assignedCrewId} · ${when(doc.scheduledStart)}${doc.crewConfirmed ? "" : " (not confirmed)"}` : "not scheduled";
    lines.push(`  ${doc.jobId} · ${doc.status} · ${doc.title} · ${doc.customerId} · ${slot}${updates.length ? ` · ${updates.length} note(s)` : ""}${doc.findings ? ` · ${doc.findings.length} findings` : ""}${doc.companyId ? ` · ${doc.companyId}` : ""}`);
  }
  for (const { doc } of work.appointments) lines.push(`  booking ${doc.appointmentId} · ${doc.serviceType} · ${doc.callerName} (${doc.customerId}) · ${when(doc.startTime)} · waiting for confirmation`);
  for (const { doc } of work.leads) lines.push(`  request ${doc.leadId} · ${doc.serviceRequested} · ${doc.callerName} (${doc.customerId}) · ${doc.urgency}`);
  return lines;
}
