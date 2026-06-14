"use client";

// Leads now live inside the unified Pipeline page (Leads tab). This route is kept
// as a redirect so existing links, bookmarks, and emails don't 404. Preserves the
// preview / urgency / lead query params so deep-links still land correctly.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LeadsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    const preview = searchParams?.get("preview");
    const urgency = searchParams?.get("urgency");
    const lead = searchParams?.get("lead");
    if (preview) params.set("preview", preview);
    params.set("tab", "leads");
    if (urgency) params.set("urgency", urgency);
    if (lead) params.set("lead", lead);
    router.replace(`/company/pipeline?${params.toString()}`);
  }, [router, searchParams]);

  return <div style={{ padding: 32, color: "#666" }}>Redirecting to Pipeline…</div>;
}
