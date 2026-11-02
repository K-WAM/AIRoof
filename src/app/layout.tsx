import { OfflineBanner } from "@/components/offline/OfflineBanner";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PostHogPageViews } from "@/components/analytics/PostHogPageViews";
import "./globals.css";

// Every page renders per request so Next can stamp the middleware's CSP nonce on its scripts (src/lib/http/csp.ts).
// A prerendered page would carry no nonce and the browser would block its scripts.
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Luxor AI",
  description: "AI receptionist platform for local service businesses.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Luxor Field",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body><OfflineBanner /><PostHogPageViews />{children}</body>
    </html>
  );
}
