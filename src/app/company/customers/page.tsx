"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import type { CustomerSlim } from "@/types/customer";
import { CustomersSection } from "../library/CustomersSection";

/**
 * Customers, as its own top-level page (it used to live only inside Library, where nobody looks for it). Same list,
 * same instant client-side search, same detail view — see CustomersSection. Titled with the industry's own word
 * ("Patients", "Clients"…) via vocab, never a hardcoded "Customers".
 */
export default function CustomersPage() {
  const businessId = useBusinessId();
  const { vocab } = useBusinessModules();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams?.get("customerId");
  const [customers, setCustomers] = useState<CustomerSlim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let live = true;
    fetch(`/api/company/customers?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Customers request failed"))))
      .then((d: { customers?: CustomerSlim[] }) => { if (live) setCustomers(d.customers ?? []); })
      .catch(() => { if (live) setLoadError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [businessId]);

  if (loading) return <PageSkeleton rows={5} />;
  if (loadError) {
    return <PageError message={`${vocab.customerNounPlural} could not be loaded.`} onRetry={() => window.location.reload()} />;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={20} strokeWidth={1.75} />
            {vocab.customerNounPlural}
          </h1>
          <p className="page-subtitle">
            Everyone you work for, with their history. New callers are added automatically; type to search instantly.
          </p>
        </div>
      </header>
      <CustomersSection businessId={businessId} customers={customers} setCustomers={setCustomers} initialCustomerId={initialCustomerId} />
    </>
  );
}
