"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FieldTabBar from "./FieldTabBar";
import "../app/field-command/field-command.css";
import type { JobRecord } from "../lib/types";

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

const BOROUGHS: { key: BoroughKey; label: string }[] = [
  { key: "MN", label: "Manhattan" },
  { key: "BK", label: "Brooklyn" },
  { key: "QN", label: "Queens" },
  { key: "BX", label: "Bronx" },
  { key: "SI", label: "Staten Is." },
];

const STATUS_FILTERS = [
  { key: "all", label: "Status" },
  { key: "open", label: "Open" },
  { key: "awarded", label: "Awarded" },
  { key: "pending", label: "Pending" },
];

type StatusKey = "complete" | "noaccess" | "refused" | "pending" | "awarded" | "open";

const STATUS_META: { key: StatusKey; label: string; color: string; match: (s: string, job: JobRecord) => boolean }[] = [
  { key: "complete", label: "Completed", color: "#30d158", match: (s) => s.includes("complete") },
  { key: "noaccess", label: "No Access", color: "#ff9f0a", match: (s) => s.includes("no access") },
  { key: "refused", label: "Refused", color: "#ff453a", match: (s) => s.includes("refused") },
  { key: "pending", label: "Pending", color: "#0a84ff", match: (s) => s.includes("pending") },
  { key: "awarded", label: "Awarded", color: "#0a84ff", match: (s, job) => s.includes("award") || job.amountValue > 0 },
  { key: "open", label: "Open", color: "#64d2ff", match: () => true },
];

function jobBorough(job: JobRecord): BoroughKey | "NYC" {
  const raw = (job.borough || "").toUpperCase();
  if (raw.includes("BROOKLYN") || raw === "BK") return "BK";
  if (raw.includes("MANHATTAN") || raw === "MN") return "MN";
  if (raw.includes("BRONX") || raw === "BX") return "BX";
  if (raw.includes("QUEENS") || raw === "QN") return "QN";
  if (raw.includes("STATEN") || raw === "SI") return "SI";
  const zip = (job.address || "").match(/\b\d{5}\b/)?.[0] || "";
  const z = Number(zip);
  if (z >= 10001 && z <= 10282) return "MN";
  if (z >= 10451 && z <= 10475) return "BX";
  if (z >= 11201 && z <= 11256) return "BK";
  if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return "QN";
  if (z >= 10301 && z <= 10314) return "SI";
  return "NYC";
}

function jobStatusMeta(job: JobRecord) {
  const s = (job.status || "").toLowerCase();
  return STATUS_META.find((meta) => meta.match(s, job)) || STATUS_META[STATUS_META.length - 1];
}

function parseUsDate(raw: string) {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  const year = yr.length === 2 ? 2000 + Number(yr) : Number(yr);
  const date = new Date(year, Number(mo) - 1, Number(da));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobAgeDays(job: JobRecord) {
  if (!job.awardDate) return null;
  const date = parseUsDate(job.awardDate);
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function matchesSearch(job: JobRecord, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    job.id.toLowerCase().includes(q) ||
    job.address.toLowerCase().includes(q) ||
    job.tenantName.toLowerCase().includes(q)
  );
}

export function MobileJobsBoard({ jobs }: { jobs: JobRecord[]; title?: string; subtitle?: string }) {
  const [search, setSearch] = useState("");
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("all");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);

  const boroughCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((job) => {
      const key = jobBorough(job);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [jobs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { open: 0, awarded: 0, pending: 0 };
    jobs.forEach((job) => {
      const s = (job.status || "").toLowerCase();
      if (s.includes("award") || job.amountValue > 0) counts.awarded += 1;
      else if (s.includes("pending")) counts.pending += 1;
      else counts.open += 1;
    });
    return counts;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (status !== "all") {
        const s = (job.status || "").toLowerCase();
        if (status === "awarded" && !(s.includes("award") || job.amountValue > 0)) return false;
        if (status === "pending" && !s.includes("pending")) return false;
        if (status === "open" && (s.includes("award") || job.amountValue > 0 || s.includes("pending"))) return false;
      }
      if (!matchesSearch(job, search)) return false;
      return true;
    });
  }, [jobs, borough, status, search]);

  return (
    <main className={`fc-app ${selectedJob ? "fc-has-job" : ""}`}>
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">HPD</span>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">HPD Bid Dashboard 2026</p>
              <h1 className="fc-title">Jobs</h1>
            </div>
          </div>
          <div className="fc-topbar-actions">
            <Link href="/field-command/" className="fc-icon-btn" aria-label="Map">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                <line x1="9" y1="3" x2="9" y2="18" />
                <line x1="15" y1="6" x2="15" y2="21" />
              </svg>
            </Link>
          </div>
        </div>
        <div className="fc-live-row">
          <span className="fc-live-dot">Live</span>
          <span className="fc-active-count">{jobs.length} Total Jobs</span>
        </div>
      </header>

      <div className="fc-search-row">
        <div className="fc-search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search jobs, address, tenant..."
            aria-label="Search jobs"
          />
        </div>
      </div>

      <section className="fc-control-drawer" style={{ display: "block" }} aria-label="Job filters">
        <div className="fc-pill-row" role="group" aria-label="Borough filter">
          <button type="button" className={`fc-pill ${borough === "ALL" ? "is-active" : ""}`} onClick={() => setBorough("ALL")}>
            <strong>All</strong>
            <span>{jobs.length}</span>
          </button>
          {BOROUGHS.map(({ key }) => (
            <button
              key={key}
              type="button"
              className={`fc-pill fc-${key.toLowerCase()} ${borough === key ? "is-active" : ""}`}
              onClick={() => setBorough(key)}
            >
              <strong>{key}</strong>
              <span>{boroughCounts[key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="fc-pill-row fc-status-pill-row" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`fc-pill ${status === key ? "is-active" : ""}`}
              onClick={() => setStatus(key)}
            >
              <strong>{label}</strong>
              <span>{key === "all" ? jobs.length : statusCounts[key] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="fc-jobs-list">
        {!filteredJobs.length ? (
          <p className="fc-jobs-empty">No jobs match these filters</p>
        ) : (
          filteredJobs.map((job) => {
            const meta = jobStatusMeta(job);
            const days = jobAgeDays(job);
            const bk = jobBorough(job);
            return (
              <button key={job.id} type="button" className="fc-job-card" onClick={() => setSelectedJob(job)}>
                <div className="fc-job-card-top">
                  <span className="fc-job-card-id">{job.id}</span>
                  <span className="fc-job-card-status" style={{ background: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <p className="fc-job-card-address">{job.address || "Address not captured"}</p>
                <div className="fc-job-card-tags">
                  <span className="fc-job-card-tag">{bk}</span>
                  {days !== null ? <span className="fc-job-card-tag fc-age-tag">{days}d old</span> : null}
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedJob ? (
        <div className="fc-job-sheet-overlay" onClick={() => setSelectedJob(null)}>
          <div className="fc-job-sheet fc-job-sheet-flow" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="fc-job-sheet-close" aria-label="Close" onClick={() => setSelectedJob(null)}>
              ×
            </button>
            <div className="fc-job-sheet-hero">
              <div>
                <span className="fc-job-sheet-kicker">OMO</span>
                <strong className="fc-job-sheet-id">{selectedJob.id}</strong>
              </div>
              <span className="fc-building-icon" aria-hidden="true">HPD</span>
            </div>
            <div className="fc-address-row">
              <p>{selectedJob.address || "Address not captured"}</p>
              <Link href={`/jobs/${selectedJob.id}`} className="fc-route-btn fc-route-google">
                Full Page
              </Link>
            </div>
            <div className="fc-job-sheet-tags">
              <span className="fc-job-sheet-tag">{jobBorough(selectedJob)}</span>
              <span className="fc-job-sheet-tag" style={{ background: jobStatusMeta(selectedJob).color }}>
                {jobStatusMeta(selectedJob).label}
              </span>
              {jobAgeDays(selectedJob) !== null ? (
                <span className="fc-job-sheet-tag fc-age-tag">{jobAgeDays(selectedJob)}d old</span>
              ) : null}
            </div>
            <section className="fc-flow-card fc-scope-card">
              <div className="fc-flow-card-main">
                <span className="fc-flow-icon">S</span>
                <span>
                  <b>Complete Scope</b>
                  <small>{selectedJob.description || "Scope not captured yet."}</small>
                </span>
              </div>
            </section>
            {selectedJob.tenantName || selectedJob.tenantPhone ? (
              <section className="fc-flow-card fc-tenant-card">
                <div className="fc-flow-card-main">
                  <span className="fc-flow-icon tenant">T</span>
                  <span>
                    <b>Tenant contact</b>
                    <small>{[selectedJob.tenantName, selectedJob.tenantPhone].filter(Boolean).join(" · ") || "Request contact from HPD"}</small>
                  </span>
                  {selectedJob.tenantPhone ? (
                    <a className="fc-call-btn" href={`tel:${selectedJob.tenantPhone}`}>
                      Call
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      <FieldTabBar />
    </main>
  );
}
