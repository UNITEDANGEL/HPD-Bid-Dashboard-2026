import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./dashboard-table-upgrade.css";

export const metadata: Metadata = {
  title: "HPD Bid Dashboard 2026",
  description: "Premium HPD bid analytics, field map, paperwork, and award tracking dashboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}





