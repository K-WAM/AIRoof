import { redirect } from "next/navigation";

// Agent settings tab was removed from client nav (superadmin-only concern).
// Redirect any direct hits to the dashboard.
export default function CompanyAgentPage() {
  redirect("/company/dashboard");
}
