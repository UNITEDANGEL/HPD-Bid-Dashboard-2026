"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type JobRecord = {
  id?: string;
  address?: string;
  borough?: string;
  status?: string;
  trade?: string;
};

function asArray(value: unknown): JobRecord[] {
  if (Array.isArray(value)) return value as JobRecord[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) return obj.jobs as JobRecord[];
    if (Array.isArray(obj.data)) return obj.data as JobRecord[];
    if (Array.isArray(obj.records)) return obj.records as JobRecord[];
  }
  return [];
}

export default function MobileCommandDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [status, setStatus] = useState("Loading jobs...");

  useEffect(() => {
    fetch("/api/jobs", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const rows = asArray(data);
        setJobs(rows);
        setStatus(`${rows.length} records loaded`);
      })
      .catch(() => setStatus("Jobs API unavailable"));
  }, []);

  const cards = [
    ["Jobs Board", "/jobs", "Review HPD work orders", "📋"],
    ["Map", "/map", "Open free map view", "🗺️"],
    ["Fetcher / Filler", "/automation", "Run the working automation", "⚙️"],
    ["Invoice Generator", "/invoice-generator", "Create invoice drafts", "🧾"],
    ["Outputs", "/outputs", "View generated files", "📦"],
    ["System Status", "/system-status", "Check app health", "🩺"],
  ];

  return (
    <main className="shell">
      <style jsx global>{`
        body {
          margin: 0;
          background:
            radial-gradient(circle at top left, rgba(66,232,243,.18), transparent 28rem),
            linear-gradient(180deg, #06101f, #050914);
          color: #f8fbff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .shell {
          min-height: 100vh;
          max-width: 880px;
          margin: 0 auto;
          padding: 16px;
        }

        .top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }

        .logo {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 1000;
        }

        .brand {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .brand h1,
        .brand p {
          margin: 0;
        }

        .brand h1 {
          font-size: 18px;
        }

        .brand p,
        .muted {
          color: #aebbd0;
        }

        .pill {
          border: 1px solid rgba(83,230,156,.4);
          background: rgba(83,230,156,.13);
          color: #caffdf;
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 900;
          font-size: 12px;
        }

        .hero {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(16,28,48,.94);
          border-radius: 28px;
          padding: 22px;
          box-shadow: 0 24px 80px rgba(0,0,0,.35);
        }

        .hero h2 {
          margin: 8px 0 10px;
          font-size: clamp(34px, 10vw, 68px);
          line-height: .92;
          letter-spacing: -.075em;
        }

        .hero p {
          color: #aebbd0;
          line-height: 1.5;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }

        .action {
          min-height: 54px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,.14);
        }

        .primary {
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
        }

        .secondary {
          background: rgba(255,255,255,.08);
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 14px 0;
        }

        .stat {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.07);
          border-radius: 20px;
          padding: 14px;
        }

        .stat strong {
          display: block;
          font-size: 28px;
        }

        .stat span {
          color: #aebbd0;
          font-size: 12px;
          font-weight: 800;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .card {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(16,28,48,.94);
          border-radius: 24px;
          padding: 18px;
          min-height: 132px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .icon {
          font-size: 30px;
        }

        .card h3 {
          margin: 10px 0 6px;
          font-size: 21px;
          letter-spacing: -.05em;
        }

        .card p {
          margin: 0;
          color: #aebbd0;
          font-size: 14px;
          line-height: 1.35;
        }

        @media (max-width: 700px) {
          .shell {
            padding: 14px;
          }

          .actions,
          .grid {
            grid-template-columns: 1fr;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .hero {
            border-radius: 24px;
          }
        }
      `}</style>

      <header className="top">
        <div className="brand">
          <div className="logo">HPD</div>
          <div>
            <h1>Bid Management</h1>
            <p>{status}</p>
          </div>
        </div>
        <span className="pill">Render</span>
      </header>

      <section className="hero">
        <p className="muted">2026 Mobile Command Center</p>
        <h2>One clean phone dashboard for bids, maps, fillers, invoices, and outputs.</h2>
        <p>
          This is the new main screen. The existing fetcher/filler stays under Automation.
          Mapbox is removed; the map uses free OpenStreetMap.
        </p>

        <div className="actions">
          <Link href="/automation" className="action primary">Run Fetcher / Filler</Link>
          <Link href="/map" className="action secondary">Open Map</Link>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <strong>{jobs.length}</strong>
          <span>Total records</span>
        </div>
        <div className="stat">
          <strong>{jobs.filter((j) => (j.status || "").toLowerCase().includes("award")).length}</strong>
          <span>Awarded</span>
        </div>
        <div className="stat">
          <strong>{jobs.filter((j) => j.address).length}</strong>
          <span>With address</span>
        </div>
      </section>

      <section className="grid">
        {cards.map(([title, href, desc, icon]) => (
          <Link href={href} className="card" key={href}>
            <div className="icon">{icon}</div>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
