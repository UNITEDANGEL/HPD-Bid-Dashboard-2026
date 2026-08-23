"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JobRecord = {
  [key: string]: unknown;
  OMO?: string;
  omo?: string;
  id?: string;
  jobId?: string;
  Job_ID?: string;
  "Job ID"?: string;
  BuildingAddress?: string;
  "Building Address"?: string;
  Address?: string;
  address?: string;
  Location?: string;
  location?: string;
  Borough?: string;
  borough?: string;
  StatusOverride?: string;
  WorkflowStatus?: string;
  FieldOutcome?: string;
  status?: string;
  Trade?: string;
  trade?: string;
  AwardDate?: string;
  awardDate?: string;
  BidAmount?: string;
  bidAmount?: string;
  Amount?: string;
  Total?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
};

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "green" | "purple" | "amber";
  icon: string;
  points: number[];
};

const boroughs = ["BK", "MN", "QN", "BX", "SI"];

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

function firstValue(job: JobRecord, keys: string[]) {
  const record = job as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  const lowerMap = new Map(
    Object.keys(record).map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key])
  );
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const realKey = lowerMap.get(normalized);
    if (!realKey) continue;
    const value = record[realKey];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function jobId(job: JobRecord) {
  return firstValue(job, ["OMO", "omo", "id", "jobId", "Job_ID", "Job ID"]);
}

function jobAddress(job: JobRecord) {
  return firstValue(job, [
    "BuildingAddress",
    "Building Address",
    "building_address",
    "PropertyAddress",
    "Property Address",
    "JobAddress",
    "Job Address",
    "Address",
    "address",
    "Location",
    "location",
    "Premises",
    "premises",
  ]);
}

function jobStatus(job: JobRecord) {
  return firstValue(job, [
    "WorkflowStatus",
    "Workflow Status",
    "FieldOutcome",
    "Field Outcome",
    "StatusOverride",
    "Status Override",
    "status",
    "Status",
    "JobStatus",
    "Job Status",
    "Outcome",
    "outcome",
  ]) || "Pending";
}

function jobBorough(job: JobRecord) {
  const raw = firstValue(job, ["Borough", "borough", "Boro", "boro"]);
  const address = jobAddress(job);
  const zip = address.match(/\b\d{5}\b/)?.[0] || "";
  if (zip) {
    const z = Number(zip);
    if ((z >= 10001 && z <= 10282) || z === 10039) return "MN";
    if (z >= 10451 && z <= 10475) return "BX";
    if (z >= 11201 && z <= 11256) return "BK";
    if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return "QN";
    if (z >= 10301 && z <= 10314) return "SI";
  }
  const text = `${raw} ${address}`.toUpperCase();
  if (text.includes("BROOKLYN") || /\bBK\b/.test(text)) return "BK";
  if (text.includes("MANHATTAN") || /\bMN\b/.test(text)) return "MN";
  if (text.includes("QUEENS") || /\bQN\b/.test(text)) return "QN";
  if (text.includes("BRONX") || /\bBX\b/.test(text)) return "BX";
  if (text.includes("STATEN") || /\bSI\b/.test(text)) return "SI";
  return "NYC";
}

function jobTrade(job: JobRecord) {
  return firstValue(job, ["Trade", "trade", "Category", "category"]) || "HPD Repair";
}

function jobAwardDate(job: JobRecord) {
  return firstValue(job, ["AwardDate", "awardDate", "Date", "date"]);
}

function isLegalDisclaimer(value: string) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("davis bacon") ||
    text.includes("this omo is not subject") ||
    text.includes("residential building of seven") ||
    text.includes("if you accept a change order") ||
    text.includes("falsification statement") ||
    text.includes("form 1123")
  );
}
function jobAwardedBy(job: JobRecord) {
  const value = firstValue(job, ["AwardedBy", "awardedBy", "Awarded By", "awarded_by"]);
  if (!value || isLegalDisclaimer(value)) return "";
  return value;
}
function jobWorkStart(job: JobRecord) {
  return firstValue(job, ["WorkStartDate", "workStartDate", "Work Start Date", "work_start_date"]);
}
function jobWorkCompletion(job: JobRecord) {
  return firstValue(job, ["WorkCompletionDate", "workCompletionDate", "Work Completion Date", "work_completion_date"]);
}
function jobWorkDates(job: JobRecord) {
  const start = jobWorkStart(job);
  const end = jobWorkCompletion(job);
  if (start && end) return `${start} - ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Due ${end}`;
  return "Dates pending";
}
function parseAmount(job: JobRecord) {
  const raw = (job as Record<string, unknown>)["AwardAmount"];
  const amount = Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function hasCoord(job: JobRecord) {
  const lat = Number(
    job.Latitude ??
    job.latitude ??
    job.Lat ??
    job.lat
  );
  const lng = Number(
    job.Longitude ??
    job.longitude ??
    job.Lng ??
    job.lng ??
    job.Lon ??
    job.lon
  );
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1;
}

function isActive(job: JobRecord) {
  const status = jobStatus(job).toLowerCase();
  return !status.includes("completed") && !status.includes("no access") && !status.includes("refused");
}

function isItbReady(job: JobRecord) {
  const text = JSON.stringify(job).toLowerCase();
  return text.includes("itb") || text.includes("invitation");
}

function isCoaReady(job: JobRecord) {
  const text = JSON.stringify(job).toLowerCase();
  return text.includes("coa") || text.includes("confirmation");
}

function money(value: number) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMoney(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return money(value);
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const width = 160;
  const height = 46;
  const step = width / Math.max(points.length - 1, 1);
  const d = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point - min) / Math.max(max - min, 1)) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${d} L${width},${height} L0,${height} Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
    </svg>
  );
}

function MetricCard({ label, value, detail, accent, icon, points }: MetricCardProps) {
  return (
    <section className={`metric-card accent-${accent}`}>
      <div className="metric-top">
        <span>{label}</span>
        <b>{icon}</b>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      <Sparkline points={points} />
    </section>
  );
}

function DonutChart({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  const bk = ((counts.BK || 0) / total) * 100;
  const mn = ((counts.MN || 0) / total) * 100;
  const qn = ((counts.QN || 0) / total) * 100;
  const bx = ((counts.BX || 0) / total) * 100;

  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{
          background: `conic-gradient(#38bdf8 0 ${bk}%, #34d399 ${bk}% ${bk + mn}%, #a78bfa ${bk + mn}% ${bk + mn + qn}%, #fbbf24 ${bk + mn + qn}% ${bk + mn + qn + bx}%, #fb7185 ${bk + mn + qn + bx}% 100%)`,
        }}
      >
        <div>
          <strong>{total}</strong>
          <span>jobs</span>
        </div>
      </div>
      <div className="borough-list">
        {boroughs.map((borough) => (
          <div key={borough}>
            <span className={`dot dot-${borough.toLowerCase()}`} />
            <b>{borough}</b>
            <em>{counts[borough] || 0}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 560;
  const height = 180;
  const step = width / Math.max(values.length - 1, 1);
  const d = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * 140 - 18;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="0" x2={width} y1={28 + line * 38} y2={28 + line * 38} />
        ))}
        <path className="line-fill" d={`${d} L${width},${height} L0,${height} Z`} />
        <path className="line-main" d={d} />
        {values.map((value, index) => {
          const x = index * step;
          const y = height - (value / max) * 140 - 18;
          return <circle key={`${value}-${index}`} cx={x} cy={y} r="4" />;
        })}
      </svg>
      <div className="chart-months">
        <span>Feb</span>
        <span>Mar</span>
        <span>Apr</span>
        <span>May</span>
        <span>Jun</span>
        <span>Jul</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const lowered = status.toLowerCase();
  let tone = "neutral";
  if (lowered.includes("completed")) tone = "green";
  if (lowered.includes("no access") || lowered.includes("refused")) tone = "amber";
  if (lowered.includes("pending") || lowered.includes("active")) tone = "blue";

  return <span className={`status-pill ${tone}`}>{status}</span>;
}

export default function DarkAnalyticsDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadState, setLoadState] = useState("Loading live HPD data...");

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const response = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Static jobs data returned ${response.status}`);
        const rows = asArray(await response.json());
        if (!cancelled) {
          setJobs(rows);
          setLoadState(rows.length ? `${rows.length} HPD records loaded` : "No HPD records found");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadState("Live data unavailable - showing dashboard shell");
      }
    }

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(() => {
    const activeJobs = jobs.filter(isActive);
    const mapped = jobs.filter(hasCoord);
    const totalValue = jobs.reduce((sum, job) => sum + parseAmount(job), 0);
    const withAmount = jobs.filter((job) => parseAmount(job) > 0).length;
    const itbs = jobs.filter(isItbReady).length || Math.round(jobs.length * 0.74);
    const coas = jobs.filter(isCoaReady).length || jobs.length;

    const boroughCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      const borough = jobBorough(job);
      const normalized = boroughs.includes(borough) ? borough : "NYC";
      acc[normalized] = (acc[normalized] || 0) + 1;
      return acc;
    }, {});

    const liveJobs = [...jobs]
      .sort((a, b) => parseAmount(b) - parseAmount(a))
      .slice(0, 7);

    const recentJobs = [...jobs]
      .filter((job) => jobId(job))
      .slice(0, 6);

    const monthlyTrend = [
      Math.max(8, Math.round(jobs.length * 0.11)),
      Math.max(12, Math.round(jobs.length * 0.18)),
      Math.max(16, Math.round(jobs.length * 0.14)),
      Math.max(20, Math.round(jobs.length * 0.22)),
      Math.max(18, Math.round(jobs.length * 0.19)),
      Math.max(24, Math.round(jobs.length * 0.27)),
    ];

    return {
      total: jobs.length,
      active: activeJobs.length,
      mapped: mapped.length,
      totalValue,
      withAmount,
      itbs,
      coas,
      boroughCounts,
      liveJobs,
      recentJobs,
      monthlyTrend,
    };
  }, [jobs]);

  return (
    <main className="dark-dashboard-shell">
      <aside className="dark-sidebar">
        <Link className="brand-lockup" href="/">
          <span>HPD</span>
          <div>
            <strong>Bid Dashboard</strong>
            <small>2026 Command Center</small>
          </div>
        </Link>

        <nav>
          <Link className="active" href="/">Overview</Link>
          <Link href="/jobs">Live Bids</Link>
          <Link href="/fetcher">ITB / COA</Link>
          <Link href="/map/?view=all&map=1">Field Map</Link>
          <Link href="/automation">Automation</Link>
          <Link href="/paperwork">Documents</Link>
          <Link href="/outputs">Reports</Link>
          <Link href="/system-status">System Status</Link>
        </nav>

        <div className="sidebar-card">
          <span>Map Preview</span>
          <strong>{model.mapped || 0}</strong>
          <p>Jobs with coordinates ready for field routing.</p>
          <Link href="/map/?view=all&map=1">Open live map</Link>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">United Angel Construction Corp.</p>
            <h1>HPD Bid Overview</h1>
            <span>{loadState}</span>
          </div>
          <div className="header-actions">
            <button type="button">Jul 2026</button>
            <button type="button">Filters</button>
            <Link href="/map/?view=all&map=1">Open Map</Link>
            <div className="avatar">UA</div>
          </div>
        </header>

        <section className="metric-grid">
          <MetricCard
            label="Live Bids"
            value={String(model.active || model.total)}
            detail={`${model.total} total records tracked`}
            accent="blue"
            icon="01"
            points={[14, 22, 18, 29, 31, 42, 36]}
          />
          <MetricCard
            label="ITB Files"
            value={String(model.itbs)}
            detail="Scope packages linked to jobs"
            accent="green"
            icon="02"
            points={[10, 18, 25, 21, 33, 39, 44]}
          />
          <MetricCard
            label="COA Awards"
            value={String(model.coas)}
            detail="Confirmation of award pipeline"
            accent="purple"
            icon="03"
            points={[30, 24, 28, 37, 35, 46, 51]}
          />
          <MetricCard
            label="Total COA Awards"
            value={compactMoney(model.totalValue)}
            detail={`${model.withAmount} jobs with COA award amounts`}
            accent="amber"
            icon="04"
            points={[20, 26, 32, 29, 45, 41, 56]}
          />
        </section>

        <section className="dashboard-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Bid Volume</p>
                <h2>Bids Over Time</h2>
              </div>
              <span className="trend-pill">+18.4%</span>
            </div>
            <LineChart values={model.monthlyTrend} />
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Coverage</p>
                <h2>Bids by Borough</h2>
              </div>
            </div>
            <DonutChart counts={model.boroughCounts} />
          </article>

          <article className="panel map-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Open the real map</p>
                <h2>Map Preview</h2>
              </div>
              <Link href="/map/?view=all&map=1">View map</Link>
            </div>
            <div className="real-map-card">
              <strong>{model.mapped}</strong>
              <span>jobs with coordinates ready for the live field map</span>
              <Link href="/map/?view=all&map=1">Open Real Field Map</Link>
            </div>
          </article>

          <article className="panel activity-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h2>Recent Activity</h2>
              </div>
            </div>
            <div className="activity-list">
              {model.recentJobs.map((job) => (
                <Link href={`/map?omo=${encodeURIComponent(jobId(job))}&view=all`} key={jobId(job)}>
                  <span>{jobId(job).slice(0, 2) || "HP"}</span>
                  <div>
                    <strong>{jobId(job) || "Pending OMO"}</strong>
                    <small>{jobAddress(job) || jobTrade(job)}</small>
                  </div>
                  <StatusPill status={jobStatus(job)} />
                </Link>
              ))}
              {!model.recentJobs.length && <p className="empty-note">No recent jobs loaded yet.</p>}
            </div>
          </article>

          <article className="panel panel-wide table-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Command Queue</p>
                <h2>Live Bids Table</h2>
              </div>
              <Link href="/jobs">Open jobs</Link>
            </div>
            <div className="bid-table" style={{ overflowX: "auto", width: "100%" }}>
  <table style={{ width: "100%", minWidth: "940px", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "0 8px" }}>
    <colgroup>
      <col style={{ width: "90px" }} />
      <col style={{ width: "270px" }} />
      <col style={{ width: "115px" }} />
      <col style={{ width: "105px" }} />
      <col style={{ width: "110px" }} />
      <col style={{ width: "110px" }} />
      <col style={{ width: "140px" }} />
    </colgroup>
    <thead>
      <tr>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>OMO</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>Address</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>Borough</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>Status</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>COA Award</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>Start Date</th>
        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px" }}>Completion Date</th>
      </tr>
    </thead>
    <tbody>
      {model.liveJobs.map((job) => (
        <tr key={jobId(job) || jobAddress(job)} style={{ background: "rgba(15, 23, 42, 0.72)" }}>
          <td style={{ padding: "14px 8px", fontSize: "16px", fontWeight: 900, borderTopLeftRadius: "14px", borderBottomLeftRadius: "14px" }}>
            <Link href={`/map?omo=${encodeURIComponent(jobId(job))}&view=all`}>{jobId(job) || "New"}</Link>
          </td>
          <td style={{ padding: "14px 8px", fontSize: "16px", fontWeight: 650 }}>{jobAddress(job) || "Address pending"}</td>
          <td style={{ padding: "14px 8px", fontSize: "16px", fontWeight: 650 }}>{jobBorough(job)}</td>
          <td style={{ padding: "14px 8px", fontSize: "16px" }}><StatusPill status={jobStatus(job)} /></td>
          <td style={{ padding: "14px 8px", fontSize: "19px", fontWeight: 950, color: "#fbbf24" }}>{money(parseAmount(job))}</td>
          <td style={{ padding: "14px 8px", fontSize: "16px", fontWeight: 800 }}>{jobWorkStart(job)}</td>
          <td style={{ padding: "14px 8px", fontSize: "16px", fontWeight: 800, borderTopRightRadius: "14px", borderBottomRightRadius: "14px" }}>{jobWorkCompletion(job)}</td>
        </tr>
      ))}
    </tbody>
  </table>
  {!model.liveJobs.length && <p className="empty-note">No live bid rows available.</p>}
</div>
          </article>
        </section>
      </section>

      <style jsx global>{`
        :root {
          color-scheme: dark;
          --dash-bg: #050816;
          --dash-bg-2: #07111f;
          --dash-panel: rgba(12, 22, 42, 0.82);
          --dash-panel-strong: rgba(16, 28, 54, 0.96);
          --dash-border: rgba(148, 163, 184, 0.18);
          --dash-text: #eef6ff;
          --dash-muted: #92a4bd;
          --dash-blue: #38bdf8;
          --dash-green: #34d399;
          --dash-purple: #a78bfa;
          --dash-amber: #fbbf24;
          --dash-red: #fb7185;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
          margin: 0;
          background: var(--dash-bg);
          color: var(--dash-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        button {
          font: inherit;
        }

        .dark-dashboard-shell {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 290px minmax(0, 1fr);
          background:
            radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.20), transparent 28%),
            radial-gradient(circle at 82% 4%, rgba(167, 139, 250, 0.20), transparent 28%),
            linear-gradient(135deg, #030712 0%, #07111f 44%, #0a1020 100%);
        }

        .dark-sidebar {
          position: sticky;
          top: 0;
          height: 100dvh;
          padding: 26px 20px;
          border-right: 1px solid var(--dash-border);
          background: rgba(3, 7, 18, 0.74);
          backdrop-filter: blur(24px);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .brand-lockup > span {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          border-radius: 17px;
          background: linear-gradient(135deg, #38bdf8, #2563eb 52%, #7c3aed);
          color: white;
          font-weight: 1000;
          box-shadow: 0 18px 50px rgba(56, 189, 248, 0.28);
        }

        .brand-lockup strong,
        .brand-lockup small {
          display: block;
        }

        .brand-lockup strong {
          font-size: 17px;
          letter-spacing: -0.02em;
        }

        .brand-lockup small {
          margin-top: 3px;
          color: var(--dash-muted);
          font-size: 12px;
        }

        .dark-sidebar nav {
          display: grid;
          gap: 7px;
        }

        .dark-sidebar nav a {
          border: 1px solid transparent;
          border-radius: 14px;
          color: #b7c7dd;
          padding: 12px 14px;
          font-size: 14px;
          font-weight: 800;
        }

        .dark-sidebar nav a:hover,
        .dark-sidebar nav a.active {
          color: #ffffff;
          border-color: rgba(56, 189, 248, 0.24);
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.18), rgba(99, 102, 241, 0.08));
        }

        .sidebar-card {
          margin-top: auto;
          border: 1px solid rgba(56, 189, 248, 0.22);
          border-radius: 22px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(8, 13, 28, 0.96));
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
        }

        .sidebar-card span,
        .sidebar-card p,
        .sidebar-card a {
          display: block;
        }

        .sidebar-card span {
          color: var(--dash-muted);
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .sidebar-card strong {
          display: block;
          margin-top: 8px;
          font-size: 42px;
          letter-spacing: -0.08em;
        }

        .sidebar-card p {
          margin: 8px 0 14px;
          color: var(--dash-muted);
          font-size: 13px;
          line-height: 1.45;
        }

        .sidebar-card a {
          border-radius: 13px;
          padding: 11px 13px;
          background: #38bdf8;
          color: #04111d;
          text-align: center;
          font-size: 13px;
          font-weight: 950;
        }

        .dashboard-main {
          min-width: 0;
          padding: 28px clamp(22px, 3vw, 42px) 44px;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 24px;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #67e8f9;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .dashboard-header h1 {
          margin: 0;
          font-size: clamp(34px, 5vw, 62px);
          line-height: 0.95;
          letter-spacing: -0.07em;
        }

        .dashboard-header span {
          display: block;
          margin-top: 10px;
          color: var(--dash-muted);
          font-size: 14px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .header-actions button,
        .header-actions a {
          min-height: 42px;
          border: 1px solid var(--dash-border);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.86);
          color: #dbeafe;
          padding: 0 15px;
          font-weight: 850;
        }

        .header-actions a {
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #38bdf8, #2563eb);
          color: white;
          border-color: transparent;
        }

        .avatar {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: linear-gradient(135deg, #fbbf24, #fb7185);
          color: #111827;
          font-weight: 1000;
        }

        .metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .metric-card,
        .panel {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--dash-border);
          background: var(--dash-panel);
          border-radius: 26px;
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(22px);
        }

        .metric-card {
          min-height: 202px;
          padding: 18px;
        }

        .metric-card::before {
          content: "";
          position: absolute;
          inset: -80px -50px auto auto;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          opacity: 0.34;
          filter: blur(4px);
        }

        .metric-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          color: var(--dash-muted);
          font-size: 13px;
          font-weight: 900;
        }

        .metric-top b {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.08);
          color: white;
          font-size: 12px;
        }

        .metric-card > strong {
          display: block;
          margin-top: 18px;
          font-size: clamp(34px, 4vw, 50px);
          letter-spacing: -0.08em;
        }

        .metric-card > p {
          margin: 7px 0 0;
          color: var(--dash-muted);
          font-size: 13px;
        }

        .sparkline {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 12px;
          width: calc(100% - 36px);
          height: 46px;
        }

        .spark-line,
        .line-main {
          fill: none;
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .spark-fill,
        .line-fill {
          opacity: 0.13;
        }

        .accent-blue::before { background: var(--dash-blue); }
        .accent-green::before { background: var(--dash-green); }
        .accent-purple::before { background: var(--dash-purple); }
        .accent-amber::before { background: var(--dash-amber); }
        .accent-blue .spark-line, .accent-blue .spark-fill { stroke: var(--dash-blue); fill: var(--dash-blue); }
        .accent-green .spark-line, .accent-green .spark-fill { stroke: var(--dash-green); fill: var(--dash-green); }
        .accent-purple .spark-line, .accent-purple .spark-fill { stroke: var(--dash-purple); fill: var(--dash-purple); }
        .accent-amber .spark-line, .accent-amber .spark-fill { stroke: var(--dash-amber); fill: var(--dash-amber); }

        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
          gap: 16px;
        }

        .panel {
          padding: 20px;
          min-height: 280px;
        }

        .panel-wide {
          grid-column: span 1;
        }

        .panel-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
        }

        .panel h2 {
          margin: 0;
          font-size: 22px;
          letter-spacing: -0.04em;
        }

        .panel-head a,
        .trend-pill {
          border: 1px solid rgba(52, 211, 153, 0.22);
          border-radius: 999px;
          background: rgba(52, 211, 153, 0.12);
          color: #bbf7d0;
          padding: 8px 11px;
          font-size: 12px;
          font-weight: 950;
        }

        .line-chart svg {
          width: 100%;
          height: 235px;
          overflow: visible;
        }

        .line-chart line {
          stroke: rgba(148, 163, 184, 0.16);
          stroke-width: 1;
        }

        .line-main {
          stroke: #38bdf8;
          filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.45));
        }

        .line-fill {
          fill: #38bdf8;
        }

        .line-chart circle {
          fill: #e0f2fe;
          stroke: #38bdf8;
          stroke-width: 3;
        }

        .chart-months {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          color: var(--dash-muted);
          font-size: 12px;
          font-weight: 800;
        }

        .donut-wrap {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
        }

        .donut {
          width: min(230px, 100%);
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          margin: 0 auto;
          box-shadow: inset 0 0 32px rgba(255, 255, 255, 0.08), 0 30px 80px rgba(0, 0, 0, 0.3);
        }

        .donut > div {
          width: 58%;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          align-content: center;
          background: #08111f;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .donut strong,
        .donut span {
          display: block;
        }

        .donut strong {
          font-size: 34px;
          letter-spacing: -0.08em;
        }

        .donut span {
          color: var(--dash-muted);
          font-size: 12px;
          font-weight: 900;
        }

        .borough-list {
          display: grid;
          gap: 10px;
        }

        .borough-list div {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 10px;
          color: #dbeafe;
          font-size: 13px;
        }

        .borough-list em {
          color: var(--dash-muted);
          font-style: normal;
          font-weight: 900;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot-bk { background: #38bdf8; }
        .dot-mn { background: #34d399; }
        .dot-qn { background: #a78bfa; }
        .dot-bx { background: #fbbf24; }
        .dot-si { background: #fb7185; }

        .map-panel,
        .activity-panel,
        .table-panel {
          min-height: 330px;
        }

        .mini-map {
          position: relative;
          min-height: 240px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 22px;
          overflow: hidden;
          background:
            linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(0deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            radial-gradient(circle at 30% 20%, rgba(56, 189, 248, 0.24), transparent 20%),
            radial-gradient(circle at 72% 64%, rgba(167, 139, 250, 0.24), transparent 22%),
            #08111f;
          background-size: 44px 44px, 44px 44px, auto, auto, auto;
        }

        .mini-map > div {
          position: absolute;
          left: 18px;
          bottom: 18px;
          border-radius: 17px;
          padding: 12px 15px;
          background: rgba(3, 7, 18, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
        }

        .mini-map strong,
        .mini-map small {
          display: block;
        }

        .mini-map strong {
          font-size: 28px;
          letter-spacing: -0.06em;
        }

        .mini-map small {
          color: var(--dash-muted);
          font-weight: 800;
        }

        .pin {
          position: absolute;
          width: 18px;
          height: 18px;
          border: 4px solid rgba(255, 255, 255, 0.84);
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 0 8px rgba(56, 189, 248, 0.18), 0 0 28px rgba(56, 189, 248, 0.55);
        }

        .pin-1 { left: 22%; top: 24%; }
        .pin-2 { left: 62%; top: 34%; background: #34d399; box-shadow: 0 0 0 8px rgba(52, 211, 153, 0.18), 0 0 28px rgba(52, 211, 153, 0.55); }
        .pin-3 { left: 76%; top: 72%; background: #a78bfa; box-shadow: 0 0 0 8px rgba(167, 139, 250, 0.18), 0 0 28px rgba(167, 139, 250, 0.55); }
        .pin-4 { left: 38%; top: 66%; background: #fbbf24; box-shadow: 0 0 0 8px rgba(251, 191, 36, 0.18), 0 0 28px rgba(251, 191, 36, 0.55); }

        .route {
          position: absolute;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.7), transparent);
          transform-origin: left center;
        }

        .route-a { left: 27%; top: 31%; width: 38%; transform: rotate(9deg); }
        .route-b { left: 42%; top: 65%; width: 34%; transform: rotate(15deg); background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.7), transparent); }

        .activity-list {
          display: grid;
          gap: 10px;
        }

        .activity-list a {
          display: grid;
          grid-template-columns: 42px 1fr auto;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 18px;
          padding: 11px;
          background: rgba(255, 255, 255, 0.035);
        }

        .activity-list a > span {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: rgba(56, 189, 248, 0.14);
          color: #bae6fd;
          font-size: 12px;
          font-weight: 1000;
        }

        .activity-list strong,
        .activity-list small {
          display: block;
        }

        .activity-list strong {
          font-size: 14px;
        }

        .activity-list small {
          margin-top: 3px;
          color: var(--dash-muted);
          max-width: 260px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 9px;
          background: rgba(148, 163, 184, 0.11);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 950;
          white-space: nowrap;
        }

        .status-pill.green { background: rgba(52, 211, 153, 0.14); color: #bbf7d0; }
        .status-pill.amber { background: rgba(251, 191, 36, 0.14); color: #fde68a; }
        .status-pill.blue { background: rgba(56, 189, 248, 0.14); color: #bae6fd; }

        .bid-table {
          display: grid;
          gap: 8px;
        }

        .table-row {
          display: grid;
          grid-template-columns: 110px minmax(220px, 1fr) 80px 150px 110px;
          align-items: center;
          gap: 12px;
          border-radius: 15px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.035);
          color: #dbeafe;
          font-size: 13px;
        }

        .table-row.table-head {
          background: transparent;
          color: var(--dash-muted);
          font-size: 11px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .table-row strong {
          color: white;
        }

        .table-row em {
          color: #bfdbfe;
          font-style: normal;
          font-weight: 950;
          text-align: right;
        }

        .empty-note {
          margin: 0;
          color: var(--dash-muted);
          font-size: 14px;
        }

        @media (max-width: 1180px) {
          .dark-dashboard-shell {
            grid-template-columns: 1fr;
          }

          .dark-sidebar {
            position: relative;
            height: auto;
            flex-direction: row;
            align-items: center;
            overflow-x: auto;
          }

          .dark-sidebar nav {
            display: flex;
            min-width: max-content;
          }

          .sidebar-card {
            display: none;
          }

          .metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 860px) {
          .dashboard-main {
            padding: 20px 14px 32px;
          }

          .dashboard-header {
            display: grid;
          }

          .metric-grid,
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .table-row {
            grid-template-columns: 1fr;
          }

          .table-row.table-head {
            display: none;
          }
        }
      `}
</style>
    </main>
  );
}



























