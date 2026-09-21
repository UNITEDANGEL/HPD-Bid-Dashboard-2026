"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FieldTabBar from "./FieldTabBar";
import "../app/field-command/field-command.css";
import type { JobRecord } from "../lib/types";

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

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

function isOpenStatus(job: JobRecord) {
  const s = (job.status || "").toLowerCase();
  return !s.includes("complete") && !s.includes("refused") && !s.includes("no access");
}

export const OVERDUE_THRESHOLD_DAYS = 30;

export function overdueJobs(jobs: JobRecord[]) {
  return jobs
    .map((job) => ({ job, days: jobAgeDays(job) }))
    .filter((entry): entry is { job: JobRecord; days: number } => entry.days !== null && entry.days > OVERDUE_THRESHOLD_DAYS && isOpenStatus(entry.job))
    .sort((a, b) => b.days - a.days);
}

export function MobileAlertsBoard({ jobs }: { jobs: JobRecord[] }) {
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const overdue = useMemo(() => overdueJobs(jobs), [jobs]);

  return (
    <main className={`fc-app ${selectedJob ? "fc-has-job" : ""}`}>
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">HPD</span>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">HPD Bid Dashboard 2026</p>
              <h1 className="fc-title">Alerts</h1>
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
          <span className="fc-live-dot" style={{ color: overdue.length ? "#ff453a" : "#7bf0a3" }}>
            {overdue.length ? "Needs attention" : "All clear"}
          </span>
          <span className="fc-active-count">{overdue.length} job{overdue.length === 1 ? "" : "s"} over {OVERDUE_THRESHOLD_DAYS}d old</span>
        </div>
      </header>

      <div className="fc-jobs-list">
        {!overdue.length ? (
          <p className="fc-jobs-empty">No jobs are over {OVERDUE_THRESHOLD_DAYS} days old right now. Nice work.</p>
        ) : (
          overdue.map(({ job, days }) => (
            <button key={job.id} type="button" className="fc-job-card" onClick={() => setSelectedJob(job)}>
              <div className="fc-job-card-top">
                <span className="fc-job-card-id">{job.id}</span>
                <span className="fc-job-card-status" style={{ background: "#b42332" }}>{days}d old</span>
              </div>
              <p className="fc-job-card-address">{job.address || "Address not captured"}</p>
              <div className="fc-job-card-tags">
                <span className="fc-job-card-tag">{jobBorough(job)}</span>
                {job.trade ? <span className="fc-job-card-tag">{job.trade}</span> : null}
              </div>
            </button>
          ))
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
              <span className="fc-job-sheet-tag" style={{ background: "#b42332" }}>
                {jobAgeDays(selectedJob)}d old
              </span>
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
          </div>
        </div>
      ) : null}

      <FieldTabBar />
    </main>
  );
}
