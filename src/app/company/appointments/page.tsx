"use client";

// Appointments now live inside the unified Pipeline page (Appointments tab). This
// route is kept as a redirect so existing links, bookmarks, and confirmation emails
// don't 404. Preserves the preview / appt query params so deep-links still land.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AppointmentsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    const preview = searchParams?.get("preview");
    const appt = searchParams?.get("appt");
    if (preview) params.set("preview", preview);
    params.set("tab", "appointments");
    if (appt) params.set("appt", appt);
    router.replace(`/company/pipeline?${params.toString()}`);
  }, [router, searchParams]);

  return <div style={{ padding: 32, color: "#666" }}>Redirecting to Pipeline…</div>;
}
