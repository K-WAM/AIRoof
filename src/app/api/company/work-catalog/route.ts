import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import {
  WORK_CATALOG_MAX_ITEMS,
  type WorkCatalog,
  type WorkCatalogItem,
  type WorkCatalogLine,
  type WorkSeverity,
} from "@/types/workCatalog";

// GET /api/company/work-catalog?businessId=  -> { catalog }
// PUT /api/company/work-catalog  { businessId, items } replaces the items.
// Stored at businesses/{bid}/library/workCatalog — its OWN doc, never merged
// into library/pricing. Every response is noStore (the Cache-Control rule:
// single-tenant cookie-authenticated data must never be public/s-maxage).

const EMPTY_CATALOG: WorkCatalog = { items: [] };

const SEVERITIES: readonly WorkSeverity[] = ["low", "medium", "high"];
const LINE_KINDS: readonly WorkCatalogLine["kind"][] = ["material", "labor", "other"];

const MAX_CATEGORY_CHARS = 60;
const MAX_PROBLEM_CHARS = 160;
const MAX_SOLUTION_CHARS = 1200;
const MAX_LINES_PER_ITEM = 12;
// Defensive caps beyond the spec's minimum so a hostile payload cannot bloat
// the 1 MB catalog doc with a single absurd line.
const MAX_LINE_DESCRIPTION_CHARS = 300;
const MAX_LINE_UNIT_CHARS = 40;

// Plain text only — rejects opening/closing tags and HTML comments. A bare "<"
// or ">" in ordinary trade wording (e.g. "3/4\" pipe") is not a tag and stays
// legal; this only refuses strings that look like markup.
const HTML_PATTERN = /<!--|<\/?[a-z][^>]*>/i;

const isPlainText = (value: string): boolean => !HTML_PATTERN.test(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function asCleanString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

type ValidateResult = { ok: true; items: WorkCatalogItem[] } | { ok: false; error: string };

function validateItems(raw: unknown, now: number): ValidateResult {
  if (!Array.isArray(raw)) return { ok: false, error: "items must be an array" };
  if (raw.length > WORK_CATALOG_MAX_ITEMS) {
    return { ok: false, error: `the catalog is limited to ${WORK_CATALOG_MAX_ITEMS} items` };
  }

  const items: WorkCatalogItem[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const at = `item ${i + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `${at} is invalid` };
    }
    const e = entry as Record<string, unknown>;

    const itemId = asCleanString(e.itemId);
    if (!itemId) return { ok: false, error: `${at} is missing an id` };
    if (seenIds.has(itemId)) return { ok: false, error: `${at} repeats the id "${itemId}"` };
    seenIds.add(itemId);

    const category = asCleanString(e.category);
    const problem = asCleanString(e.problem);
    const solution = asCleanString(e.solution);
    if (!category || !problem || !solution) {
      return { ok: false, error: `${at} needs a category, problem, and solution` };
    }
    if (category.length > MAX_CATEGORY_CHARS) return { ok: false, error: `${at} category is longer than ${MAX_CATEGORY_CHARS} characters` };
    if (problem.length > MAX_PROBLEM_CHARS) return { ok: false, error: `${at} problem is longer than ${MAX_PROBLEM_CHARS} characters` };
    if (solution.length > MAX_SOLUTION_CHARS) return { ok: false, error: `${at} solution is longer than ${MAX_SOLUTION_CHARS} characters` };
    for (const [field, value] of [["category", category], ["problem", problem], ["solution", solution]] as const) {
      if (!isPlainText(value)) return { ok: false, error: `${at} ${field} must be plain text` };
    }

    let severity: WorkSeverity | undefined;
    if (e.severity !== undefined && e.severity !== null && e.severity !== "") {
      if (typeof e.severity !== "string" || !SEVERITIES.includes(e.severity as WorkSeverity)) {
        return { ok: false, error: `${at} severity must be one of low, medium, high` };
      }
      severity = e.severity as WorkSeverity;
    }

    let lines: WorkCatalogLine[] | undefined;
    if (e.lines !== undefined && e.lines !== null) {
      if (!Array.isArray(e.lines)) return { ok: false, error: `${at} lines must be an array` };
      if (e.lines.length > MAX_LINES_PER_ITEM) {
        return { ok: false, error: `${at} has more than ${MAX_LINES_PER_ITEM} lines` };
      }
      lines = [];
      for (let j = 0; j < e.lines.length; j++) {
        const rawLine = e.lines[j];
        const atLine = `${at}, line ${j + 1}`;
        if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
          return { ok: false, error: `${atLine} is invalid` };
        }
        const l = rawLine as Record<string, unknown>;
        const description = asCleanString(l.description);
        if (!description) return { ok: false, error: `${atLine} needs a description` };
        if (description.length > MAX_LINE_DESCRIPTION_CHARS) return { ok: false, error: `${atLine} description is too long` };
        if (!isPlainText(description)) return { ok: false, error: `${atLine} description must be plain text` };
        if (!isFiniteNumber(l.quantity) || l.quantity <= 0) return { ok: false, error: `${atLine} quantity must be greater than zero` };
        if (!isFiniteNumber(l.unitPrice) || l.unitPrice < 0) return { ok: false, error: `${atLine} unit price cannot be negative` };
        if (typeof l.kind !== "string" || !LINE_KINDS.includes(l.kind as WorkCatalogLine["kind"])) {
          return { ok: false, error: `${atLine} kind must be one of material, labor, other` };
        }
        let unit: string | undefined;
        if (l.unit !== undefined && l.unit !== null && l.unit !== "") {
          if (typeof l.unit !== "string" || l.unit.trim().length > MAX_LINE_UNIT_CHARS || !isPlainText(l.unit)) {
            return { ok: false, error: `${atLine} unit is invalid` };
          }
          unit = l.unit.trim();
        }
        lines.push({ description, quantity: l.quantity, unit, unitPrice: l.unitPrice, kind: l.kind as WorkCatalogLine["kind"] });
      }
    }

    items.push({
      itemId,
      category,
      problem,
      solution,
      ...(severity ? { severity } : {}),
      ...(lines ? { lines } : {}),
      ...(e.starter === true ? { starter: true } : {}),
      createdAt: isFiniteNumber(e.createdAt) ? e.createdAt : now,
    });
  }

  return { ok: true, items };
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "no-store");
    return auth.error;
  }

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const snap = await db.collection(`businesses/${businessId}/library`).doc("workCatalog").get();
  const catalog: WorkCatalog = snap.exists ? (snap.data() as WorkCatalog) : EMPTY_CATALOG;
  return jsonWithCache({ catalog }, "noStore");
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "no-store");
    return auth.error;
  }

  const validated = validateItems(body?.items, Date.now());
  if (!validated.ok) return jsonWithCache({ error: validated.error }, "noStore", { status: 400 });

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const now = Date.now();
  // Replaces items and stamps updatedAt; merge:true clears nothing else
  // (starterKitImported and any future fields stay).
  await db.collection(`businesses/${businessId}/library`).doc("workCatalog").set(
    { items: validated.items, updatedAt: now },
    { merge: true }
  );

  return jsonWithCache({ ok: true, catalog: { items: validated.items, updatedAt: now } }, "noStore");
}

// POST /api/company/work-catalog  { businessId, item: { category, problem, solution, severity?, lines? } }
// Appends ONE item (the "Save to Library" checkbox on a one-off finding / custom quote item). The server assigns
// the itemId and runs the same validation as PUT, so a job-page save can never bypass the catalog's caps.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "no-store");
    return auth.error;
  }
  const rawItem = body?.item;
  if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
    return jsonWithCache({ error: "item required" }, "noStore", { status: 400 });
  }

  const now = Date.now();
  const itemId = `custom-${crypto.randomUUID()}`;
  const validated = validateItems([{ ...(rawItem as Record<string, unknown>), itemId, starter: false, createdAt: now }], now);
  if (!validated.ok) return jsonWithCache({ error: validated.error }, "noStore", { status: 400 });

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const ref = db.collection(`businesses/${businessId}/library`).doc("workCatalog");
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const items = snap.exists ? ((snap.data() as WorkCatalog).items ?? []) : [];
    if (items.length >= WORK_CATALOG_MAX_ITEMS) return { full: true as const };
    tx.set(ref, { items: [...items, validated.items[0]], updatedAt: now }, { merge: true });
    return { full: false as const };
  });
  if (outcome.full) {
    return jsonWithCache({ error: `the catalog is limited to ${WORK_CATALOG_MAX_ITEMS} items` }, "noStore", { status: 409 });
  }
  return jsonWithCache({ ok: true, item: validated.items[0] }, "noStore", { status: 201 });
}
