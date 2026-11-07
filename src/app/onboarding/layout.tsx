import type { Metadata } from "next";
import s from "@/components/onboarding/onboarding.module.css";
export const metadata: Metadata = { title: "Your onboarding · Luxor", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function OnboardingLayout({ children }: { children: React.ReactNode }) { return <div className={s.publicShell}>{children}</div>; }
