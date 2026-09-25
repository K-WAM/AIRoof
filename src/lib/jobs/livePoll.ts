import type { FieldUpdate, Job, JobPhotoMeta } from "@/types/jobs";

export interface JobPollResult {
  job: Job;
  updates: FieldUpdate[] | null;
  photos: JobPhotoMeta[] | null;
}

/**
 * One tick of the office job page's live view. Reads ONE document (the job); only when its `updatedAt` moved does it
 * pull the field updates (and the photo list, if the Photos tab has been opened). Returns null when nothing changed
 * or the poll failed — a failed background poll must keep whatever is already on screen, so it never throws.
 * Anything that changes what the page shows bumps job.updatedAt: field updates and punches (writeJobProjection),
 * status changes, findings, and photo upload/delete (photos store).
 */
export async function pollJobOnce(opts: {
  businessId: string;
  jobId: string;
  lastSeenUpdatedAt: number;
  includePhotos: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JobPollResult | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = `/api/jobs/${opts.jobId}`;
  const query = `businessId=${encodeURIComponent(opts.businessId)}`;
  try {
    const res = await doFetch(`${base}?${query}`);
    if (!res.ok) return null;
    const { job } = (await res.json()) as { job?: Job };
    if (!job || job.updatedAt === opts.lastSeenUpdatedAt) return null;

    const [updatesRes, photosRes] = await Promise.all([
      doFetch(`${base}/updates?${query}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      opts.includePhotos ? doFetch(`${base}/photos?${query}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      job,
      updates: (updatesRes?.updates as FieldUpdate[] | undefined) ?? null,
      photos: (photosRes?.photos as JobPhotoMeta[] | undefined) ?? null,
    };
  } catch {
    return null;
  }
}
