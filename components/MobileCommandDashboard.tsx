"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JobRecord = {
  id?: string;
  address?: string;
  location?: string;
  borough?: string;
  status?: string;
  trade?: string;
  awardDate?: string;
  bidAmount?: string;
  amountValue?: number;
  coaFile?: string;
  itbFile?: string;
  tenantPhone?: string;
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

function money(job: JobRecord) {
  if (typeof job.amountValue === "number" && Number.isFinite(job.amountValue) && job.amountValue > 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(job.amountValue);
  }

  return job.bidAmount || "No amount";
}

function statusClass(status?: string) {
  const value = (status || "").toLowerCase();
  if (value.includes("award")) return "good";
  if (value.includes("open") || value.includes("new")) return "hot";
  if (value.includes("pending")) return "warn";
  return "neutral";
}

export default function MobileCommandDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState("Loading jobs...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) throw new Error(`Jobs API returned ${res.status}`);
        const rows = asArray(await res.json());

        if (!cancelled) {
          setJobs(rows);
          setLoadState(rows.length ? `${rows.length} records loaded` : "No records found yet");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadState("Jobs API unavailable");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const awarded = jobs.filter((job) => (job.status || "").toLowerCase().includes("award")).length;
    const mapped = jobs.filter(hasCoord).length;
    const docs = jobs.filter((job) => job.coaFile || job.itbFile).length;
    const phones = jobs.filter((job) => job.tenantPhone).length;

    return {
      total: jobs.length,
      awarded,
      mapped,
      docs,
      phones,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const rows = !needle
      ? jobs
      : jobs.filter((job) =>
          [
            job.id,
            job.address,
            job.location,
            job.borough,
            job.status,
            job.trade,
            job.awardDate,
            job.bidAmount,
            job.tenantPhone,
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );

    return rows.slice(0, 30);
  }, [jobs, query]);

  const cards = [
    {
      href: "/jobs",
      title: "Jobs Board",
      sub: "Search and review every HPD work order.",
      badge: `${stats.total} jobs`,
      icon: "Jobs",
    },
    {
      href: "/map",
      title: "All Jobs Map",
      sub: "Phone-ready map with list drawer and markers.",
      badge: `${stats.mapped} ready`,
      icon: "Map",
    },
    {
      href: "/automation",
      title: "Fetcher / Filler",
      sub: "Run the existing automation pipeline.",
      badge: "Run",
      icon: "Auto",
    },
    {
      href: "/invoice-generator",
      title: "Invoice Generator",
      sub: "Create invoice drafts from jobs.",
      badge: "PDF",
      icon: "Inv",
    },
    {
      href: "/outputs",
      title: "Output Center",
      sub: "Review filled PDFs, invoices, logs, and exports.",
      badge: "Files",
      icon: "Out",
    },
    {
      href: "/system-status",
      title: "System Status",
      sub: "Check jobs API, map readiness, and worker status.",
      badge: "OK",
      icon: "Sys",
    },
  ];

  return (
    <main className="hpd-home-shell">
      <style jsx global>{`
        :root {
          color-scheme: dark;
          --hpd-bg: #06101f;
          --hpd-panel: rgba(16, 28, 48, 0.94);
          --hpd-panel-soft: rgba(255, 255, 255, 0.075);
          --hpd-line: rgba(255, 255, 255, 0.14);
          --hpd-text: #f8fbff;
          --hpd-muted: #aebbd0;
          --hpd-blue: #47a3ff;
          --hpd-cyan: #42e8f3;
          --hpd-green: #53e69c;
          --hpd-gold: #ffd166;
          --hpd-red: #ff6b7a;
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
          max-width: 1020px;
          margin: 0 auto;
          padding: max(16px, env(safe-area-inset-top)) 16px max(92px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top left, rgba(66, 232, 243, 0.14), transparent 28rem),
            radial-gradient(circle at top right, rgba(71, 163, 255, 0.16), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .hpd-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .hpd-logo {
          flex: 0 0 auto;
          width: 48px;
          height: 48px;
          border-radius: 17px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, var(--hpd-cyan), var(--hpd-blue));
          color: #04111f;
          font-weight: 950;
          box-shadow: 0 16px 42px rgba(66, 232, 243, 0.2);
        }

        .hpd-brand h1,
        .hpd-brand p {
          margin: 0;
        }

        .hpd-brand h1 {
          font-size: 16px;
          letter-spacing: -0.035em;
        }

        .hpd-brand p {
          color: var(--hpd-muted);
          font-size: 12px;
        }

        .hpd-live-pill {
          flex: 0 0 auto;
          border: 1px solid rgba(83, 230, 156, 0.4);
          background: rgba(83, 230, 156, 0.13);
          color: #caffdf;
          border-radius: 999px;
          padding: 9px 11px;
          font-weight: 900;
          font-size: 12px;
        }

        .hpd-hero {
          border: 1px solid var(--hpd-line);
          background: linear-gradient(145deg, rgba(20, 38, 68, 0.96), rgba(9, 19, 34, 0.96));
          border-radius: 28px;
          padding: 22px;
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.36);
          overflow: hidden;
          position: relative;
        }

        .hpd-hero::after {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          right: -60px;
          top: -70px;
          background: rgba(66, 232, 243, 0.13);
          pointer-events: none;
        }

        .hpd-kicker,
        .hpd-muted {
          color: var(--hpd-muted);
          margin: 0;
        }

        .hpd-hero h2 {
          position: relative;
          margin: 10px 0;
          max-width: 720px;
          font-size: clamp(38px, 11vw, 72px);
          line-height: 0.91;
          letter-spacing: -0.08em;
        }

        .hpd-hero-copy {
          position: relative;
          margin: 0;
          max-width: 720px;
          color: var(--hpd-muted);
          line-height: 1.52;
          font-size: 15px;
        }

        .hpd-hero-actions {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }

        .hpd-action {
          min-height: 56px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          font-weight: 950;
          border: 1px solid var(--hpd-line);
        }

        .hpd-action.primary {
          color: #04111f;
          background: linear-gradient(135deg, var(--hpd-cyan), var(--hpd-blue));
        }

        .hpd-action.secondary {
          background: rgba(255, 255, 255, 0.08);
        }

        .hpd-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 14px 0;
        }

        .hpd-stat {
          border: 1px solid var(--hpd-line);
          background: var(--hpd-panel-soft);
          border-radius: 20px;
          padding: 14px 12px;
          min-width: 0;
        }

        .hpd-stat strong {
          display: block;
          font-size: 25px;
          line-height: 1;
          letter-spacing: -0.055em;
        }

        .hpd-stat span {
          display: block;
          margin-top: 7px;
          color: var(--hpd-muted);
          font-size: 11px;
          font-weight: 850;
        }

        .hpd-command-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin: 16px 0;
        }

        .hpd-command-card {
          min-height: 142px;
          border: 1px solid var(--hpd-line);
          background: var(--hpd-panel);
          border-radius: 24px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }

        .hpd-command-card:active {
          transform: scale(0.985);
          border-color: rgba(66, 232, 243, 0.65);
          background: rgba(20, 38, 68, 0.98);
        }

        .hpd-command-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .hpd-command-icon {
          min-width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(66, 232, 243, 0.22), rgba(71, 163, 255, 0.16));
          color: #dffcff;
          font-weight: 950;
          font-size: 12px;
        }

        .hpd-badge {
          border: 1px solid var(--hpd-line);
          background: rgba(255, 255, 255, 0.075);
          border-radius: 999px;
          padding: 5px 8px;
          color: #d9e9ff;
          font-size: 11px;
          font-weight: 950;
          white-space: nowrap;
        }

        .hpd-command-card h3 {
          margin: 14px 0 6px;
          font-size: 20px;
          line-height: 1.02;
          letter-spacing: -0.055em;
        }

        .hpd-command-card p {
          margin: 0;
          color: var(--hpd-muted);
          line-height: 1.36;
          font-size: 13px;
        }

        .hpd-search-panel,
        .hpd-feed {
          border: 1px solid var(--hpd-line);
          background: var(--hpd-panel);
          border-radius: 24px;
          padding: 16px;
          margin-top: 14px;
        }

        .hpd-search-panel input {
          width: 100%;
          min-height: 54px;
          border: 1px solid var(--hpd-line);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--hpd-text);
          padding: 0 14px;
          font-size: 16px;
          outline: none;
        }

        .hpd-feed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .hpd-feed-header h2 {
          margin: 0;
          font-size: 20px;
          letter-spacing: -0.055em;
        }

        .hpd-job-list {
          display: grid;
          gap: 10px;
        }

        .hpd-job-card {
          border: 1px solid var(--hpd-line);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          padding: 14px;
        }

        .hpd-job-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .hpd-job-card strong {
          display: block;
          font-size: 15px;
        }

        .hpd-job-card p {
          margin: 4px 0 0;
          color: var(--hpd-muted);
          font-size: 13px;
          line-height: 1.35;
        }

        .hpd-status {
          flex: 0 0 auto;
          max-width: 112px;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hpd-status.good {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .hpd-status.hot {
          background: rgba(66, 232, 243, 0.14);
          color: #c4fbff;
        }

        .hpd-status.warn {
          background: rgba(255, 209, 102, 0.14);
          color: #ffe7a3;
        }

        .hpd-status.neutral {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .hpd-bottom-nav {
          position: fixed;
          left: 50%;
          bottom: max(12px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 20;
          width: min(520px, calc(100% - 24px));
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
          border: 1px solid var(--hpd-line);
          background: rgba(7, 17, 31, 0.92);
          backdrop-filter: blur(18px);
          border-radius: 24px;
          padding: 7px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
        }

        .hpd-bottom-nav a {
          min-height: 40px;
          display: grid;
          place-items: center;
          border-radius: 17px;
          color: var(--hpd-muted);
          font-size: 11px;
          font-weight: 950;
        }

        .hpd-bottom-nav a:first-child {
          color: #04111f;
          background: linear-gradient(135deg, var(--hpd-cyan), var(--hpd-blue));
        }

        @media (max-width: 760px) {
          .hpd-home-shell {
            padding-left: 14px;
            padding-right: 14px;
          }

          .hpd-hero {
            border-radius: 24px;
            padding: 20px;
          }

          .hpd-hero-actions,
          .hpd-command-grid {
            grid-template-columns: 1fr;
          }

          .hpd-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hpd-command-card {
            min-height: 118px;
          }
        }
      `}</style>

      <header className="hpd-topbar">
        <div className="hpd-brand">
          <div className="hpd-logo">HPD</div>
          <div>
            <h1>Bid Management</h1>
            <p>{loadState}</p>
          </div>
        </div>
        <span className="hpd-live-pill">Render Ready</span>
      </header>

      <section className="hpd-hero">
        <p className="hpd-kicker">2026 Mobile Command Center</p>
        <h2>One clean app for bids, maps, fillers, invoices, and outputs.</h2>
        <p className="hpd-hero-copy">
          A phone-first dashboard with large touch targets, no overlapping panels, and fast access to the working fetcher/filler pipeline.
        </p>
        <div className="hpd-hero-actions">
          <Link className="hpd-action primary" href="/automation">
            Run Fetcher / Filler
          </Link>
          <Link className="hpd-action secondary" href="/map">
            Open All Jobs Map
          </Link>
        </div>
      </section>

      <section className="hpd-stats" aria-label="Dashboard summary">
        <div className="hpd-stat">
          <strong>{stats.total}</strong>
          <span>Total jobs</span>
        </div>
        <div className="hpd-stat">
          <strong>{stats.mapped}</strong>
          <span>Mapped</span>
        </div>
        <div className="hpd-stat">
          <strong>{stats.awarded}</strong>
          <span>Awarded</span>
        </div>
        <div className="hpd-stat">
          <strong>{stats.docs}</strong>
          <span>COA / ITB</span>
        </div>
      </section>

      <section className="hpd-command-grid" aria-label="Main actions">
        {cards.map((card) => (
          <Link href={card.href} className="hpd-command-card" key={card.href}>
            <div>
              <div className="hpd-command-top">
                <span className="hpd-command-icon">{card.icon}</span>
                <span className="hpd-badge">{card.badge}</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.sub}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="hpd-search-panel">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search OMO, address, borough, trade, status..."
        />
      </section>

      <section className="hpd-feed">
        <div className="hpd-feed-header">
          <div>
            <p className="hpd-kicker">Recent records</p>
            <h2>Phone review feed</h2>
          </div>
          <span className="hpd-badge">{filteredJobs.length}</span>
        </div>

        <div className="hpd-job-list">
          {filteredJobs.length ? (
            filteredJobs.map((job, index) => (
              <Link href={`/jobs/${encodeURIComponent(job.id || String(index))}`} className="hpd-job-card" key={`${job.id || "job"}-${index}`}>
                <div className="hpd-job-row">
                  <div>
                    <strong>{job.id || "HPD Job"}</strong>
                    <p>{job.address || job.location || "No address listed"}</p>
                    <p>
                      {job.borough || "Unknown borough"} Â· {job.trade || "Trade not listed"} Â· {money(job)}
                    </p>
                  </div>
                  <span className={`hpd-status ${statusClass(job.status)}`}>{job.status || "Status"}</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="hpd-job-card">
              <strong>No visible records</strong>
              <p>Check /api/jobs or run the fetcher from Automation.</p>
            </div>
          )}
        </div>
      </section>

      <nav className="hpd-bottom-nav" aria-label="Mobile navigation">
        <Link href="/">Home</Link>
        <Link href="/jobs">Jobs</Link>
        <Link href="/map">Map</Link>
        <Link href="/fetcher">Fetch</Link>
        <Link href="/outputs">Files</Link>
      </nav>
    </main>
  );
}

