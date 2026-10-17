// The public self-led demo (docs/SELF-LED-DEMO-PLAN.md): one field, a real call with Alice, then the office on
// autopilot. A generic, shareable URL (owner, 2026-10-16) — /try/roofing redirects here.
import type { Metadata } from "next";
import { SelfLedDemo, type DemoLine } from "@/components/demo/SelfLedDemo";
import { WORK_CATALOG_STARTER } from "@/lib/verticals/workCatalogStarter";
import { liveDemoUrl } from "@/lib/demo/liveDemoUrl";

export const metadata: Metadata = {
  title: "Live Demo | Luxor",
  description: "Call our AI receptionist as your own business, then watch the booking, job, quote, report and invoice appear.",
};

// The example quote comes from the roofing starter price list a new business starts with — never invented numbers.
function exampleLines(): DemoLine[] {
  const items = WORK_CATALOG_STARTER.roofing.filter((item) => ["Water enters at the base of the chimney during rain.",
    "The roof deck gives underfoot in a small area, indicating water-damaged sheathing."].includes(item.problem));
  return items.flatMap((item) => (item.lines ?? []).map((line) => ({
    label: `${line.description} · ${line.quantity} ${line.unit ?? ""}`.trim(), kind: line.kind, amount: line.quantity * line.unitPrice,
  })));
}

export default function DemoPage() {
  return <SelfLedDemo lines={exampleLines()} bookCallUrl={liveDemoUrl()} />;
}
