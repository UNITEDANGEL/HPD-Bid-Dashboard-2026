"use client";

import Link from "next/link";
import { useState } from "react";
import FieldTabBar from "./FieldTabBar";
import "../app/field-command/field-command.css";
import type { JobRecord } from "../lib/types";

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

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

function directionsHref(job: JobRecord) {
  const query = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : job.address || job.location;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function wazeHref(job: JobRecord) {
  if (job.latitude && job.longitude) return `https://waze.com/ul?ll=${job.latitude},${job.longitude}&navigate=yes`;
  const query = job.address || job.location;
  return query ? `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes` : "";
}

export function MobileJobDetail({ job }: { job: JobRecord }) {
  const [rawOpen, setRawOpen] = useState(false);
  const meta = jobStatusMeta(job);
  const days = jobAgeDays(job);
  const borough = jobBorough(job);
  const rawEntries = Object.entries(job.raw || {}).filter(([, v]) => v);

  return (
    <main className="fc-app">
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <Link href="/jobs" className="fc-icon-btn" aria-label="Back to jobs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">Job Profile</p>
              <h1 className="fc-title">{job.id}</h1>
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
      </header>

      <div className="fc-jobs-list" style={{ paddingTop: 10 }}>
        <div className="fc-job-card" style={{ cursor: "default" }}>
          <div className="fc-job-card-top">
            <span className="fc-job-card-id" style={{ fontSize: 18 }}>{job.id}</span>
            <span className="fc-job-card-status" style={{ background: meta.color }}>{meta.label}</span>
          </div>
          <p className="fc-job-card-address">{job.address || "Address not captured"}</p>
          <div className="fc-job-card-tags">
            <span className="fc-job-card-tag">{borough}</span>
            {days !== null ? <span className="fc-job-card-tag fc-age-tag">{days}d old</span> : null}
            {job.trade ? <span className="fc-job-card-tag">{job.trade}</span> : null}
          </div>
          <div className="fc-address-row" style={{ marginTop: 10 }}>
            {wazeHref(job) ? <a className="fc-route-btn fc-route-waze" href={wazeHref(job)} target="_blank" rel="noreferrer">Waze</a> : null}
            {directionsHref(job) ? <a className="fc-route-btn fc-route-google" href={directionsHref(job)} target="_blank" rel="noreferrer">Google</a> : null}
          </div>
        </div>

        <section className="fc-flow-card fc-scope-card">
          <div className="fc-flow-card-main">
            <span className="fc-flow-icon">S</span>
            <span>
              <b>Complete Scope</b>
              <small>{job.description || "Scope not captured yet."}</small>
            </span>
          </div>
        </section>

        {job.tenantName || job.tenantPhone ? (
          <section className="fc-flow-card fc-tenant-card">
            <div className="fc-flow-card-main">
              <span className="fc-flow-icon tenant">T</span>
              <span>
                <b>Tenant contact</b>
                <small>{[job.tenantName, job.tenantPhone].filter(Boolean).join(" · ") || "Request contact from HPD"}</small>
              </span>
              {job.tenantPhone ? <a className="fc-call-btn" href={`tel:${job.tenantPhone}`}>Call</a> : null}
            </div>
          </section>
        ) : null}

        <div className="fc-job-card" style={{ cursor: "default" }}>
          <div className="fc-job-card-top"><span className="fc-job-card-id">Award Details</span></div>
          <div className="fc-job-card-tags" style={{ flexWrap: "wrap" }}>
            {job.awardDate ? <span className="fc-job-card-tag">Awarded {job.awardDate}</span> : null}
            {job.bidAmount ? <span className="fc-job-card-tag">{job.bidAmount}</span> : null}
            {job.coaFile ? <span className="fc-job-card-tag">COA on file</span> : null}
            {job.itbFile ? <span className="fc-job-card-tag">ITB on file</span> : null}
          </div>
        </div>

        {rawEntries.length ? (
          <div className="fc-job-card" style={{ cursor: "default" }}>
            <button
              type="button"
              className="fc-job-card-top"
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={() => setRawOpen((open) => !open)}
            >
              <span className="fc-job-card-id">Raw source fields</span>
              <span className="fc-job-card-tag">{rawOpen ? "Hide" : `${rawEntries.length}`}</span>
            </button>
            {rawOpen ? (
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {rawEntries.map(([key, val]) => (
                  <p key={key} className="fc-job-card-address" style={{ margin: 0 }}>
                    <b style={{ color: "#f5f5f7" }}>{key}:</b> {val}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <FieldTabBar />
    </main>
  );
}
