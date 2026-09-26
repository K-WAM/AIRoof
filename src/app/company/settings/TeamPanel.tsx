"use client";

import Link from "next/link";

export function TeamPanel({ businessId }: { businessId: string }) {
  return (
    <section aria-label="Team" style={{ marginTop: 24 }}>
      <h2>Team</h2>
      <p>Invite teammates, review access, lock accounts, and manage field QR links.</p>
      <Link className="button" href={`/company/team?businessId=${encodeURIComponent(businessId)}`}>
        Manage team
      </Link>
    </section>
  );
}
