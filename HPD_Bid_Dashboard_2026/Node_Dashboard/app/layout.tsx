import type { Metadata } from "next";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HPD Bid Dashboard 2026",
  description: "Mobile-ready HPD work order dashboard for awards, job packets, and field review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="topbar">
            <div className="topbar-brand">
              <span className="app-mark">HPD</span>
              <div>
                <p className="eyebrow">Bid Management</p>
                <h1>2026 Field Command</h1>
              </div>
            </div>
            <p className="topbar-note">
              <span className="live-dot" aria-hidden="true" />
              Local dashboard online
            </p>
          </header>
          <main className="page-frame">{children}</main>
        </div>
      </body>
    </html>
  );
}
