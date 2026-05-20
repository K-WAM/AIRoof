import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Receptionist Platform",
  description: "Multi-tenant AI receptionist for local service businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
