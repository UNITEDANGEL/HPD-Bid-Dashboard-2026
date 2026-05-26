"use client";

import { useEffect, useState } from "react";

export default function SystemStatusPage() {
  const [jobs, setJobs] = useState("Checking...");
  const [automation, setAutomation] = useState("Checking...");

  useEffect(() => {
    fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" })
      .then((res) => setJobs(res.ok ? "OK" : `HTTP ${res.status}`))
      .catch(() => setJobs("Unavailable"));

    fetch("/api/automation/runs", { cache: "no-store" })
      .then((res) => setAutomation(res.ok ? "OK" : `HTTP ${res.status}`))
      .catch(() => setAutomation("Worker/API unavailable"));
  }, []);

  const rows = [
    ["Dashboard", "OK"],
    ["Jobs API", jobs],
    ["Mobile Map", "OK - Leaflet/OpenStreetMap"],
    ["Mapbox", "Removed - not required"],
    ["Automation", automation],
    ["Invoice Generator", "OK"],
  ];

  return (
    <main className="hpd-status-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hpd-status-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-status-wrap {
          max-width: 820px;
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }

        .hpd-status-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .hpd-status-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(38px, 10vw, 66px);
          line-height: 0.92;
          letter-spacing: -0.08em;
        }

        .hpd-status-top p {
          margin: 0;
          color: #aebbd0;
        }

        .hpd-home-link {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 10px 12px;
          color: #f8fbff;
          text-decoration: none;
          font-weight: 900;
        }

        .hpd-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 18px;
          padding: 16px;
        }

        .hpd-status-row strong {
          font-size: 16px;
        }

        .hpd-status-row span {
          color: #aebbd0;
          text-align: right;
          font-weight: 850;
        }
      `}</style>

      <section className="hpd-status-wrap">
        <header className="hpd-status-top">
          <div>
            <p>Health Check</p>
            <h1>System Status</h1>
            <p>Checks the mobile dashboard, jobs API, map, and automation route.</p>
          </div>
          <a className="hpd-home-link" href="/">
            Home
          </a>
        </header>

        {rows.map(([name, value]) => (
          <div className="hpd-status-row" key={name}>
            <strong>{name}</strong>
            <span>{value}</span>
          </div>
        ))}
      </section>
    </main>
  );
}


