"use client";
import { use } from "react";
import { AdminPortal } from "@/components/onboarding/AdminPortal";
export default function AdminOnboardingPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = use(params); return <AdminPortal businessId={businessId} />; }
