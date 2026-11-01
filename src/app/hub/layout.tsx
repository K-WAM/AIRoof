import { requireSuperadminPage } from "@/lib/auth/requireSuperadminPage";
import ClientShell from "./ClientShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSuperadminPage("/hub");
  return <ClientShell>{children}</ClientShell>;
}
