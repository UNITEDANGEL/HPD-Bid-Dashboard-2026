import type { Metadata } from "next";
import type { ReactNode } from "react";
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
            <div>
              <p className="eyebrow">HPD Bid Management</p>
              <h1>2026 Mobile Dashboard</h1>
            </div>
            <p className="topbar-note">Built for phone review, award tracking, and Render hosting.</p>
          </header>
          <main className="page-frame">{children}</main>
        </div>
      </body>
    </html>
  );
}
