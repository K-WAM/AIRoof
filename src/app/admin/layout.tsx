import { requireSuperadminPage } from "@/lib/auth/requireSuperadminPage";
import { SessionRefresh } from "@/components/auth/SessionRefresh";
import ClientShell from "./ClientShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  if ((await requireSuperadminPage("/admin")) === "refresh") return <SessionRefresh />;
  return <ClientShell>{children}</ClientShell>;
}
