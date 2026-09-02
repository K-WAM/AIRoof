"use client";

// Route entry point only — the actual Calendar UI (and its @dnd-kit dependency)
// lives in CalendarBoard.tsx and is lazy-loaded here (T-068) so this route's
// initial bundle doesn't ship drag-and-drop code before it's needed. ssr:false
// is required (and safe — this whole tree is already a client component): the
// board reads window-only APIs (Intl timezone math, drag pointer sensors) that
// have no meaningful server-rendered output anyway.
import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const CalendarBoard = dynamic(() => import("./CalendarBoard"), {
  ssr: false,
  loading: () => <PageSkeleton rows={5} />,
});

export default function CalendarPage() {
  return <CalendarBoard />;
}
