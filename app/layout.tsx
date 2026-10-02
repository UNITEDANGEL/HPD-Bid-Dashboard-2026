import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./dashboard-table-upgrade.css";
import DriveSessionKeeper from "../components/DriveSessionKeeper";
import DriveAutoBackup from "../components/DriveAutoBackup";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "HPD Bid Dashboard 2026",
  description: "Premium HPD bid analytics, field map, paperwork, and award tracking dashboard.",
  // Installable on the iPhone: Share > Add to Home Screen opens it full screen as "HPD Field".
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HPD Field", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // Older iPhones only go full screen with this tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body><DriveSessionKeeper /><DriveAutoBackup /><ServiceWorkerRegister />{children}</body>
    </html>
  );
}





