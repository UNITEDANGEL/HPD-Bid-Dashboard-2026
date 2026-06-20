"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JobRecord = {
  id?: string;
  address?: string;
  location?: string;
  borough?: string;
  status?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
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

function hasCoord(job: JobRecord) {
  const lat = Number(job.latitude ?? job.lat);
  const lng = Number(job.longitude ?? job.lng ?? job.lon);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function isFinalStatus(job: JobRecord) {
  const status = String(job.status || "").toLowerCase();
  return status.includes("completed") || status.includes("no access") || status.includes("refused");
}

export default function MobileCommandDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadState, setLoadState] = useState("Loading jobs...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Static jobs data returned ${res.status}`);
        const rows = asArray(await res.json());

        if (!cancelled) {
          setJobs(rows);
          setLoadState(rows.length ? `${rows.length} records loaded` : "No records found");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadState("Jobs data unavailable");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const mapped = jobs.filter(hasCoord).length;
    const final = jobs.filter(isFinalStatus).length;
    return {
      total: jobs.length,
      mapped,
      final,
    };
  }, [jobs]);

  return (
    <main className="hpd-home-shell">
      <style jsx global>{`
        :root {
          color-scheme: dark;
          --hpd-bg: #07111f;
          --hpd-panel: rgba(16, 28, 48, 0.94);
          --hpd-line: rgba(255, 255, 255, 0.14);
          --hpd-text: #f8fbff;
          --hpd-muted: #aebbd0;
          --hpd-green: #53e69c;
          --hpd-gold: #ffd166;
          --hpd-blue: #47a3ff;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          background: var(--hpd-bg);
          color: var(--hpd-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .hpd-home-shell {
          min-height: 100dvh;
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
          padding: max(18px, env(safe-area-inset-top)) 16px max(86px, env(safe-area-inset-bottom));
          background: linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .hpd-brand h1,
        .hpd-brand p {
          margin: 0;
        }

        .hpd-brand h1 {
          font-size: 22px;
          line-height: 1.05;
        }

        .hpd-brand p {
          margin-top: 4px;
          color: var(--hpd-muted);
          font-size: 12px;
        }

        .hpd-live-pill {
          flex: 0 0 auto;
          border: 1px solid rgba(83, 230, 156, 0.4);
          background: rgba(83, 230, 156, 0.13);
          color: #caffdf;
          border-radius: 999px;
          padding: 8px 10px;
          font-weight: 900;
          font-size: 12px;
        }

        .hpd-package-panel {
          border: 1px solid var(--hpd-line);
          background: var(--hpd-panel);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
        }

        .hpd-package-panel h2 {
          margin: 0 0 12px;
          font-size: clamp(32px, 9vw, 52px);
          line-height: 0.98;
          letter-spacing: 0;
        }

        .hpd-main-action {
          min-height: 64px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: var(--hpd-green);
          color: #03120b;
          font-size: 18px;
          font-weight: 950;
        }

        .hpd-package-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }

        .hpd-package-option {
          min-height: 86px;
          border: 1px solid var(--hpd-line);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.075);
          padding: 13px;
        }

        .hpd-package-option strong,
        .hpd-package-option span {
          display: block;
        }

        .hpd-package-option strong {
          font-size: 16px;
          line-height: 1.1;
        }

        .hpd-package-option span {
          margin-top: 7px;
          color: var(--hpd-muted);
          font-size: 12px;
          line-height: 1.35;
        }

        .hpd-package-option.no-work {
          border-color: rgba(255, 209, 102, 0.32);
        }

        .hpd-mini-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin: 12px 0;
        }

        .hpd-mini-stat {
          border: 1px solid var(--hpd-line);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 10px;
        }

        .hpd-mini-stat strong {
          display: block;
          font-size: 20px;
          line-height: 1;
        }

        .hpd-mini-stat span {
          display: block;
          margin-top: 6px;
          color: var(--hpd-muted);
          font-size: 11px;
          font-weight: 850;
        }

        .hpd-secondary-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .hpd-secondary-actions a {
          min-height: 54px;
          display: grid;
          place-items: center;
          border: 1px solid var(--hpd-line);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          font-weight: 900;
        }

        .hpd-bottom-nav {
          position: fixed;
          left: 50%;
          bottom: max(12px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 20;
          width: min(420px, calc(100% - 24px));
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          border: 1px solid var(--hpd-line);
          background: rgba(7, 17, 31, 0.92);
          backdrop-filter: blur(18px);
          border-radius: 8px;
          padding: 7px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
        }

        .hpd-bottom-nav a {
          min-height: 40px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: var(--hpd-muted);
          font-size: 11px;
          font-weight: 950;
        }

        .hpd-bottom-nav a:first-child {
          color: #04111f;
          background: var(--hpd-green);
        }

        @media (max-width: 560px) {
          .hpd-package-options,
          .hpd-secondary-actions {
            grid-template-columns: 1fr;
          }

          .hpd-mini-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>

      <header className="hpd-topbar">
        <div className="hpd-brand">
          <h1>HPD Bid Dashboard</h1>
          <p>{loadState}</p>
        </div>
        <span className="hpd-live-pill">Live</span>
      </header>

      <section className="hpd-package-panel">
        <h2>Generate Invoice Package</h2>
        <Link className="hpd-main-action" href="/paperwork">
          Open Package Filler
        </Link>

        <div className="hpd-package-options" aria-label="Invoice package options">
          <Link className="hpd-package-option" href="/paperwork?package=work">
            <strong>Work Completed</strong>
            <span>Affidavit and invoice from ITB/COA job data.</span>
          </Link>
          <Link className="hpd-package-option no-work" href="/paperwork?package=no_work">
            <strong>No Work Completed</strong>
            <span>No access, refused access, or done by others from saved JSON.</span>
          </Link>
        </div>
      </section>

      <section className="hpd-mini-stats" aria-label="Dashboard summary">
        <div className="hpd-mini-stat">
          <strong>{stats.total}</strong>
          <span>Jobs</span>
        </div>
        <div className="hpd-mini-stat">
          <strong>{stats.mapped}</strong>
          <span>Mapped</span>
        </div>
        <div className="hpd-mini-stat">
          <strong>{stats.final}</strong>
          <span>Final</span>
        </div>
      </section>

      <section className="hpd-secondary-actions" aria-label="Secondary actions">
        <Link href="/map">Open Map</Link>
        <Link href="/fetcher">Fetcher</Link>
      </section>

      <nav className="hpd-bottom-nav" aria-label="Mobile navigation">
        <Link href="/">Home</Link>
        <Link href="/map">Map</Link>
        <Link href="/paperwork">Package</Link>
        <Link href="/outputs">Files</Link>
      </nav>
    </main>
  );
}
