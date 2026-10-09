// Writes one industry's demo data into a demo business: Library starters (work catalog + prices), the Calendar's
// resources, jobs (roofing gets its fully worked example job), calls with transcripts, leads and bookings.
// Shared by Demo Studio's live line (api/admin/demo-customize) and the public per-industry sandboxes
// (api/demo/sandbox-token), so both always show the same story. The caller clears old data first; this only adds.
import type { Firestore } from "firebase-admin/firestore";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";
import type { DemoSeed } from "./demoSeed";
import { mergeWorkStarter, workCatalogStarterFor, WORK_CATALOG_STARTER } from "./workCatalogStarter";
import { mergeStarterKit, starterKitFor } from "./starterKits";
import { ROOFING_WORKED_JOB, type WorkedJobSeed } from "./demoSeedRoofing";
import { PET_CARE_WORKED_VISIT } from "./demoSeedPetCare";

// One fully worked example per industry that has one: roofing's inspection (findings, Spanish note), pet care's visit
// report ready to invoice. Others show their seeded list only.
const WORKED_JOBS: Partial<Record<VerticalId, WorkedJobSeed & { status?: string }>> = {
  roofing: ROOFING_WORKED_JOB,
  "pet-care": PET_CARE_WORKED_VISIT,
};
import { copyCatalogFinding } from "@/lib/jobs/findings";
import { writeJobProjection } from "@/lib/jobs/writeProjection";
import type { FieldUpdate } from "@/types/jobs";

export async function writeDemoSeed(db: Firestore, businessId: string, verticalId: VerticalId, now: number, seed: DemoSeed): Promise<void> {
  const t = VERTICAL_TEMPLATES[verticalId];
  const base = db.collection("businesses").doc(businessId);
  // Use the same pure import helpers as the Library starter endpoints. Start
  // empty on every launch so an earlier prospect's edits cannot leak.
  const workItems = workCatalogStarterFor(verticalId);
  if (workItems) {
    const { catalog } = mergeWorkStarter({ items: [] }, workItems, now);
    await base.collection("library").doc("workCatalog").set(catalog);
  } else {
    await base.collection("library").doc("workCatalog").set({ items: [], starterKitImported: [] });
  }
  const pricingKit = starterKitFor(verticalId);
  if (pricingKit) {
    const { library } = mergeStarterKit({ materials: [], laborRates: [], documents: [] }, pricingKit,
      !t.disabledModules.includes("pricing"), verticalId, now);
    await base.collection("library").doc("pricing").set(library);
  } else {
    await base.collection("library").doc("pricing").set({ materials: [], laborRates: [], documents: [] });
  }

  const add = db.batch();

  // Resources first — appointments/jobs below reference them by id.
  const resourceIds = seed.resources.map(() => base.collection("crews").doc());
  seed.resources.forEach((r, i) => {
    add.set(resourceIds[i], {
      ...r, crewId: resourceIds[i].id, businessId: businessId,
      active: true, createdAt: now,
    });
  });

  // Job ids are handed out from the business's jobCounter (see POST /api/jobs), so
  // seeding fixed ids without advancing it would let the next real job collide
  // with — and overwrite — a seeded one.
  const workedJobId = "J-1001";
  let workedLedger: FieldUpdate[] | undefined;
  const worked = WORKED_JOBS[verticalId];
  if (worked) {
    const catalogById = new Map(WORK_CATALOG_STARTER[verticalId].map((item) => [item.itemId, item]));
    const findings = worked.findingItemIds
      .map((itemId) => catalogById.get(itemId))
      .filter((item) => item !== undefined)
      .map((item) => copyCatalogFinding(item));
    workedLedger = worked.updates.map((update, index) => ({
      updateId: `seed-${index + 1}`,
      rawText: update.rawText,
      submittedBy: update.submittedBy,
      createdAt: now - update.minutesAgo * 60_000,
      language: update.language,
      ...(update.rawTextEn ? { rawTextEn: update.rawTextEn } : {}),
      parsed: update.parsed,
    }));
    add.set(base.collection("jobs").doc(workedJobId), {
      jobId: workedJobId,
      businessId: businessId,
      title: worked.title,
      status: worked.status ?? "inspection",
      clientName: worked.clientName,
      clientPhone: worked.clientPhone,
      clientEmail: worked.clientEmail,
      address: worked.address,
      serviceType: worked.serviceType,
      notes: worked.notes,
      findings,
      createdAt: now - 6 * 60 * 60_000,
      updatedAt: now,
    });
    workedLedger.forEach((update) => {
      add.set(base.collection("jobs").doc(workedJobId).collection("updates").doc(update.updateId), update);
    });
  }

  const firstRegularJobNumber = worked ? 1002 : 1001;
  seed.jobs.forEach(({ resourceIndex, ...j }, i) => {
    const jobId = `J-${firstRegularJobNumber + i}`;
    add.set(base.collection("jobs").doc(jobId), {
      ...j, jobId, businessId: businessId,
      ...(resourceIndex !== undefined && resourceIds[resourceIndex] ? { assignedCrewId: resourceIds[resourceIndex].id } : {}),
      createdAt: now - (i + 1) * 86_400_000, updatedAt: now,
    });
  });
  const lastSeededJobNumber = firstRegularJobNumber + seed.jobs.length - 1;
  if (seed.jobs.length > 0 || workedLedger) {
    add.update(base, { jobCounter: Math.max(1001, lastSeededJobNumber) });
  }
  seed.calls.forEach((c, i) => {
    const createdAt = now - (i + 1) * 3_600_000;
    // Deterministic transcript: the seed's 3–5 turns become CallMessage[] so the
    // Calls page renders a real conversation and "This call produced" links work.
    const messages = c.messages.map((message, index) => ({
      messageId: `seed-message-${index + 1}`,
      role: message.role,
      text: message.text,
      timestamp: createdAt + index * 5_000,
    }));
    add.set(base.collection("calls").doc(c.callId), {
      ...c, businessId: businessId, status: "completed",
      startedAt: createdAt, endedAt: createdAt + c.durationSecs * 1000, durationSecs: c.durationSecs,
      createdAt, updatedAt: now, messages,
    });
  });
  seed.leads.forEach((l, i) => {
    add.set(base.collection("leads").doc(), {
      ...l, businessId: businessId, createdAt: now - (i + 1) * 7_200_000, updatedAt: now,
    });
  });
  seed.appointments.forEach((a) => {
    const { resourceIndex, ...appt } = a;
    add.set(base.collection("appointments").doc(), {
      ...appt, businessId: businessId, endTime: a.startTime + 3_600_000,
      calendarProvider: "mock", createdAt: now, updatedAt: now,
      // Intake verticals open with a populated board; one booking stays
      // unassigned on purpose so there's always a card to drag in the demo.
      ...(resourceIndex !== undefined && resourceIds[resourceIndex]
        ? { assignedCrewId: resourceIds[resourceIndex].id }
        : {}),
    });
  });
  await add.commit();

  if (workedLedger) {
    await writeJobProjection(db, businessId, workedJobId, { ledger: workedLedger });
  }
}
