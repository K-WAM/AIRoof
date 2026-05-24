"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function useBusinessId(): string {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");

  if (user?.superadmin && preview) return preview;
  return user?.businessId ?? "demo-roofing";
}
