"use client";

// "Who's on this job, when" — one line under the customer on the job page (owner, 2026-10-04: "is there an assign crew
// selector for a job?"). Scheduling stays on the Calendar (it owns the time picker and the double-booking guard), so
// this line says the answer and links there: "Crew A · Tue Oct 7, 9:00 AM · Change" or "No crew yet · Schedule".

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Job } from "@/types/jobs";

export function JobCrewLine({ job, businessId, previewSuffix, fmtDayTime, canEdit, crewNoun = "Crew" }: {
  job: Pick<Job, "jobId" | "assignedCrewId" | "scheduledStart" | "crewConfirmed" | "status">;
  businessId: string;
  previewSuffix: string;
  fmtDayTime: (ms: number) => string;
  canEdit: boolean;
  crewNoun?: string;
}) {
  const [crewName, setCrewName] = useState<string | null>(null);
  useEffect(() => {
    if (!job.assignedCrewId) { setCrewName(null); return; }
    let live = true;
    fetch(`/api/company/crews?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { crews?: Array<{ crewId: string; name: string }> } | null) => { if (live) setCrewName(d?.crews?.find((c) => c.crewId === job.assignedCrewId)?.name ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [businessId, job.assignedCrewId]);

  if (job.status === "invoiced") return null;
  const calendar = `/company/calendar${previewSuffix}`;
  const scheduled = !!job.assignedCrewId && !!job.scheduledStart;
  return (
    <p data-testid="job-crew-line" style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
      {scheduled ? (
        <>
          <strong style={{ color: "var(--text)" }}>{crewName ?? crewNoun}</strong> · {fmtDayTime(job.scheduledStart!)}
          {!job.crewConfirmed && " · not confirmed"}
          {canEdit && <> · <Link href={calendar} style={{ color: "var(--accent)" }}>Change</Link></>}
        </>
      ) : (
        <>No {crewNoun.toLowerCase()} yet{canEdit && <> · <Link href={calendar} style={{ color: "var(--accent)", fontWeight: 600 }}>Schedule on the Calendar</Link></>}</>
      )}
    </p>
  );
}
