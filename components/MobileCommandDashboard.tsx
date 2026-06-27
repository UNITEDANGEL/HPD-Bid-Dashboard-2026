"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tenantContactInfo } from "../lib/tenantContact";

type JobRecord = {
  [key: string]: unknown;
  OMO?: string;
  Job_ID?: string;
  "Job ID"?: string;
  id?: string;
  omo?: string;
  jobId?: string;
  address?: string;
  Address?: string;
  BuildingAddress?: string;
  "Building Address"?: string;
  location?: string;
  Location?: string;
  borough?: string;
  Borough?: string;
  status?: string;
  StatusOverride?: string;
  WorkflowStatus?: string;
  FieldOutcome?: string;
  trade?: string;
  Trade?: string;
  AwardDate?: string;
  awardDate?: string;
  BidAmount?: string;
  bidAmount?: string;
  ItbTenantAccessType?: string;
  ItbTenantAppointmentNeeded?: boolean | string;
  ItbTenantApartment?: string;
  ItbTenantName?: string;
  ItbTenantPhone?: string;
  ItbTenantContactStatus?: string;
  TenantName?: string;
  TenantPhone?: string;
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
  const status = jobStatus(job).toLowerCase();
  return status.includes("completed") || status.includes("no access") || status.includes("refused");
}

function firstValue(job: JobRecord, keys: Array<keyof JobRecord | string>) {
  for (const key of keys) {
    const value = (job as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function jobId(job: JobRecord) {
  return firstValue(job, ["OMO", "omo", "id", "jobId", "Job_ID", "Job ID"]);
}

function jobAddress(job: JobRecord) {
  return firstValue(job, ["BuildingAddress", "Building Address", "Address", "address", "Location", "location"]);
}

function jobStatus(job: JobRecord) {
  return firstValue(job, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status"]) || "Pending";
}

function jobBorough(job: JobRecord) {
  return firstValue(job, ["Borough", "borough"]);
}

function jobTrade(job: JobRecord) {
  return firstValue(job, ["Trade", "trade"]);
}

function jobAmount(job: JobRecord) {
  return firstValue(job, ["BidAmount", "bidAmount"]);
}

function jobAwardDate(job: JobRecord) {
  return firstValue(job, ["AwardDate", "awardDate"]);
}

function normalizeOmoSearch(value: string) {
  return String(value || "")
    .trim()
    .replace(/^omo\s*[:#-]?\s*/i, "")
    .trim();
}

function compactSearch(value: string) {
  return normalizeOmoSearch(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function jobSearchRank(job: JobRecord, query: string) {
  const compactQuery = compactSearch(query);
  if (!compactQuery) return 0;

  const compactId = compactSearch(jobId(job));
  if (compactId === compactQuery) return 0;
  if (compactId.startsWith(compactQuery)) return 1;
  if (compactId.includes(compactQuery)) return 2;

  const text = [
    jobId(job),
    jobAddress(job),
    jobBorough(job),
    jobTrade(job),
    jobStatus(job),
    jobAwardDate(job),
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes(normalizeOmoSearch(query).toLowerCase())) return 3;
  if (text.replace(/[^a-z0-9]+/g, "").includes(compactQuery)) return 4;
  return Number.POSITIVE_INFINITY;
}

function jobMapHref(job: JobRecord) {
  const id = jobId(job);
  return id ? `/map?omo=${encodeURIComponent(id)}&view=all` : "/map";
}

function jobPackageHref(job: JobRecord, packageType?: "work" | "no_work") {
  const id = jobId(job);
  const params = new URLSearchParams();
  if (id) params.set("job", id);
  if (packageType) params.set("package", packageType);
  const query = params.toString();
  return query ? `/paperwork?${query}` : "/paperwork";
}

export default function MobileCommandDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadState, setLoadState] = useState("Loading jobs...");
  const [omoQuery, setOmoQuery] = useState("");

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

  const omoResults = useMemo(() => {
    const query = omoQuery.trim();
    if (!query) return [];

    return jobs
      .map((job) => ({ job, rank: jobSearchRank(job, query) }))
      .filter((item) => Number.isFinite(item.rank) && jobId(item.job))
      .sort((a, b) => a.rank - b.rank || jobId(a.job).localeCompare(jobId(b.job)))
      .map((item) => item.job)
      .slice(0, 5);
  }, [jobs, omoQuery]);

  const selectedOmoJob = omoResults[0] || null;
  const selectedOmoContact = tenantContactInfo(selectedOmoJob);

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

        .hpd-omo-panel {
          border: 1px solid rgba(71, 163, 255, 0.34);
          background: linear-gradient(180deg, rgba(20, 45, 74, 0.98), rgba(13, 26, 46, 0.96));
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.22);
        }

        .hpd-omo-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .hpd-omo-head strong {
          font-size: 18px;
          line-height: 1;
        }

        .hpd-omo-head span {
          color: var(--hpd-gold);
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .hpd-omo-input {
          width: 100%;
          min-height: 58px;
          border: 1px solid rgba(255, 209, 102, 0.46);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.96);
          color: #07111f;
          padding: 0 14px;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: 0;
          outline: none;
        }

        .hpd-omo-input:focus {
          border-color: var(--hpd-gold);
          box-shadow: 0 0 0 4px rgba(255, 209, 102, 0.16);
        }

        .hpd-omo-result {
          margin-top: 10px;
          display: grid;
          gap: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.18);
        }

        .hpd-omo-result h2,
        .hpd-omo-result p {
          margin: 0;
        }

        .hpd-omo-result h2 {
          font-size: 30px;
          line-height: 0.95;
        }

        .hpd-omo-result p {
          color: var(--hpd-muted);
          font-size: 13px;
          line-height: 1.35;
        }

        .hpd-omo-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .hpd-omo-meta span {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          padding: 6px 8px;
          color: #dbeafe;
          font-size: 11px;
          font-weight: 900;
        }

        .hpd-omo-meta span.final {
          border-color: rgba(255, 209, 102, 0.36);
          color: #ffe8a3;
        }

        .hpd-tenant-contact {
          border: 1px solid rgba(255, 209, 102, 0.34);
          border-radius: 8px;
          padding: 10px;
          background: rgba(255, 209, 102, 0.08);
          display: grid;
          gap: 9px;
        }

        .hpd-tenant-contact.no-appointment {
          border-color: rgba(83, 230, 156, 0.28);
          background: rgba(83, 230, 156, 0.08);
        }

        .hpd-tenant-contact-head {
          display: grid;
          gap: 4px;
        }

        .hpd-tenant-contact-head span,
        .hpd-tenant-field span {
          color: var(--hpd-muted);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hpd-tenant-contact-head strong,
        .hpd-tenant-field strong {
          color: var(--hpd-text);
          font-size: 13px;
        }

        .hpd-tenant-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }

        .hpd-tenant-field {
          display: grid;
          gap: 3px;
          min-width: 0;
          border-radius: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.07);
        }

        .hpd-tenant-field strong {
          overflow-wrap: anywhere;
        }

        .hpd-tenant-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }

        .hpd-tenant-actions a {
          min-height: 42px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          border: 1px solid var(--hpd-line);
          background: rgba(255, 255, 255, 0.1);
          color: var(--hpd-text);
          text-align: center;
          font-size: 12px;
          font-weight: 950;
        }

        .hpd-tenant-actions a.email-hpd {
          border: 0;
          background: var(--hpd-gold);
          color: #241300;
        }

        .hpd-omo-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .hpd-omo-actions a {
          min-height: 48px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          font-weight: 950;
          text-align: center;
        }

        .hpd-omo-map {
          background: var(--hpd-blue);
          color: #03101f;
        }

        .hpd-omo-package {
          border: 1px solid var(--hpd-line);
          background: rgba(255, 255, 255, 0.1);
        }

        .hpd-omo-quick-list {
          display: grid;
          gap: 6px;
        }

        .hpd-omo-quick-list button {
          width: 100%;
          min-height: 40px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: var(--hpd-text);
          text-align: left;
          padding: 8px 10px;
          font: inherit;
          font-size: 12px;
          font-weight: 850;
        }

        .hpd-omo-empty {
          margin: 10px 0 0;
          border: 1px solid rgba(255, 209, 102, 0.32);
          border-radius: 8px;
          padding: 10px;
          color: #ffe8a3;
          font-size: 13px;
          font-weight: 850;
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
          .hpd-secondary-actions,
          .hpd-omo-actions,
          .hpd-tenant-grid,
          .hpd-tenant-actions {
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

      <section className="hpd-omo-panel" aria-label="OMO command search">
        <div className="hpd-omo-head">
          <strong>OMO Search</strong>
          <span>{selectedOmoJob ? jobStatus(selectedOmoJob) : "Fast find"}</span>
        </div>
        <input
          className="hpd-omo-input"
          value={omoQuery}
          onChange={(event) => setOmoQuery(event.target.value.toUpperCase())}
          placeholder="EQ24929"
          aria-label="OMO search"
          inputMode="search"
          autoComplete="off"
        />

        {selectedOmoJob ? (
          <div className="hpd-omo-result">
            <div>
              <h2>{jobId(selectedOmoJob)}</h2>
              <p>{jobAddress(selectedOmoJob) || jobBorough(selectedOmoJob) || "No address listed"}</p>
            </div>
            <div className="hpd-omo-meta">
              <span className={isFinalStatus(selectedOmoJob) ? "final" : ""}>{jobStatus(selectedOmoJob)}</span>
              {jobBorough(selectedOmoJob) ? <span>{jobBorough(selectedOmoJob)}</span> : null}
              {jobTrade(selectedOmoJob) ? <span>{jobTrade(selectedOmoJob)}</span> : null}
              {jobAmount(selectedOmoJob) ? <span>{jobAmount(selectedOmoJob)}</span> : null}
              {jobAwardDate(selectedOmoJob) ? <span>{jobAwardDate(selectedOmoJob)}</span> : null}
            </div>
            <div className={`hpd-tenant-contact ${selectedOmoContact.appointmentNeeded ? "" : "no-appointment"}`}>
              <div className="hpd-tenant-contact-head">
                <span>{selectedOmoContact.label}</span>
                <strong>{selectedOmoContact.status}</strong>
              </div>
              {selectedOmoContact.appointmentNeeded ? (
                <>
                  <div className="hpd-tenant-grid">
                    <div className="hpd-tenant-field"><span>Name</span><strong>{selectedOmoContact.name || "Not listed"}</strong></div>
                    <div className="hpd-tenant-field"><span>Phone</span><strong>{selectedOmoContact.phone || "Not listed"}</strong></div>
                    <div className="hpd-tenant-field"><span>Apt</span><strong>{selectedOmoContact.apartment || firstValue(selectedOmoJob, ["Location", "location"]) || "Not listed"}</strong></div>
                  </div>
                  {selectedOmoContact.actionHref || selectedOmoContact.smsHref || selectedOmoContact.emailHref ? (
                    <div className="hpd-tenant-actions">
                      {selectedOmoContact.actionHref ? <a href={selectedOmoContact.actionHref}>Call</a> : null}
                      {selectedOmoContact.smsHref ? <a href={selectedOmoContact.smsHref}>Text</a> : null}
                      {selectedOmoContact.emailHref ? <a className="email-hpd" href={selectedOmoContact.emailHref}>Email HPD</a> : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="hpd-omo-actions">
              <Link className="hpd-omo-map" href={jobMapHref(selectedOmoJob)}>
                Open on Map
              </Link>
              <Link className="hpd-omo-package" href={jobPackageHref(selectedOmoJob)}>
                Package
              </Link>
            </div>
            {omoResults.length > 1 ? (
              <div className="hpd-omo-quick-list" aria-label="Other OMO matches">
                {omoResults.slice(1, 4).map((job) => (
                  <button key={jobId(job)} type="button" onClick={() => setOmoQuery(jobId(job))}>
                    {jobId(job)} - {jobAddress(job) || jobBorough(job) || jobStatus(job)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : omoQuery.trim() ? (
          <p className="hpd-omo-empty">No matching work order found.</p>
        ) : null}
      </section>

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
