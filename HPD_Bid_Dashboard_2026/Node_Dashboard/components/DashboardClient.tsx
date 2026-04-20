"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JobRecord } from "../lib/types";

type Props = {
  jobs: JobRecord[];
  title: string;
  subtitle: string;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatCurrency(amountValue: number, fallback: string) {
  if (!amountValue) return fallback || "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountValue);
}

function buildMapsHref(job: JobRecord) {
  const coords = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : "";
  const query = coords || job.address || job.location;
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function DashboardClient({ jobs, title, subtitle }: Props) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(jobs[0]?.id || "");

  const boroughs = unique(jobs.map((job) => job.borough));
  const statuses = unique(jobs.map((job) => job.status));

  const filteredJobs = jobs.filter((job) => {
    if (borough && job.borough !== borough) return false;
    if (status && job.status !== status) return false;
    if (!query.trim()) return true;

    const haystack = [
      job.id,
      job.address,
      job.trade,
      job.description,
      job.status,
      job.borough,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.trim().toLowerCase());
  });

  const selected = filteredJobs.find((job) => job.id === selectedId) || filteredJobs[0] || jobs[0] || null;
  const totalJobs = filteredJobs.length;
  const awardedCount = filteredJobs.filter((job) => job.status.toLowerCase() === "awarded").length;
  const mappedCount = filteredJobs.filter((job) => job.hasMap).length;
  const jobs2026 = filteredJobs.filter((job) => job.awardDate.includes("2026")).length;
  const topTrades = unique(filteredJobs.map((job) => job.trade)).slice(0, 5);
  const topBoroughCards = boroughs
    .map((name) => ({
      name,
      count: filteredJobs.filter((job) => job.borough === name).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return (
    <div className="dashboard-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Render Ready</p>
          <h1>{title}</h1>
          <p className="hero-copy">{subtitle}</p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-link">
              Open mobile jobs board
            </Link>
            <Link href="/api/jobs" className="secondary-link">
              Jobs API
            </Link>
          </div>
        </div>
        <div className="hero-metrics">
          <div className="metric-panel rose">
            <span>{totalJobs}</span>
            <small>Visible jobs</small>
          </div>
          <div className="metric-panel gold">
            <span>{mappedCount}</span>
            <small>Map ready</small>
          </div>
          <div className="metric-panel cyan">
            <span>{awardedCount}</span>
            <small>Awarded</small>
          </div>
          <div className="metric-panel green">
            <span>{jobs2026}</span>
            <small>2026 awards</small>
          </div>
        </div>
      </section>

      <section className="filters-card">
        <div className="filter-header">
          <div>
            <p className="eyebrow">Mobile Filters</p>
            <h2>Fast search for field and award review</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setQuery("");
              setBorough("");
              setStatus("");
            }}
          >
            Reset filters
          </button>
        </div>

        <div className="filters-grid">
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OMO, address, trade, description"
            />
          </label>
          <label>
            Borough
            <select value={borough} onChange={(event) => setBorough(event.target.value)}>
              <option value="">All boroughs</option>
              {boroughs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="insights-grid">
        <article className="insight-card">
          <p className="eyebrow">Coverage</p>
          <h3>Borough mix</h3>
          <div className="stack-list">
            {topBoroughCards.map((item) => (
              <div key={item.name} className="stack-row">
                <span>{item.name}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="insight-card">
          <p className="eyebrow">Trades</p>
          <h3>Most visible work types</h3>
          <div className="tag-grid">
            {topTrades.length ? topTrades.map((trade) => <span key={trade} className="tag-pill">{trade}</span>) : <span className="tag-pill">No trade data</span>}
          </div>
        </article>

        <article className="insight-card">
          <p className="eyebrow">Documents</p>
          <h3>Award packet readiness</h3>
          <div className="stack-list">
            <div className="stack-row">
              <span>COA matches</span>
              <strong>{filteredJobs.filter((job) => Boolean(job.coaFile)).length}</strong>
            </div>
            <div className="stack-row">
              <span>ITB matches</span>
              <strong>{filteredJobs.filter((job) => Boolean(job.itbFile)).length}</strong>
            </div>
            <div className="stack-row">
              <span>Phone records</span>
              <strong>{filteredJobs.filter((job) => Boolean(job.tenantPhone)).length}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="board-grid">
        <div className="board-main">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Jobs Feed</p>
              <h2>Phone-friendly work order board</h2>
            </div>
            <span className="section-chip">{filteredJobs.length} records</span>
          </div>

          <div className="jobs-grid">
            {filteredJobs.map((job) => (
              <button
                key={`${job.id}-${job.address}`}
                type="button"
                className={`job-card ${selected?.id === job.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(job.id)}
              >
                <div className="job-card-top">
                  <strong>{job.id}</strong>
                  <StatusBadge status={job.status} />
                </div>
                <p className="job-address">{job.address || "No address listed"}</p>
                <p className="job-meta">{job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}</p>
                <div className="job-card-bottom">
                  <span>{formatCurrency(job.amountValue, job.bidAmount)}</span>
                  <span>{job.awardDate || "No award date"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="board-side">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Job</p>
              <h2>Field-ready preview</h2>
            </div>
          </div>

          {selected ? (
            <div className="detail-card">
              <div className="detail-head">
                <div>
                  <h3>{selected.id}</h3>
                  <p>{selected.address || "No address listed"}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div className="detail-grid">
                <div>
                  <strong>Trade</strong>
                  <span>{selected.trade || "Not listed"}</span>
                </div>
                <div>
                  <strong>Borough</strong>
                  <span>{selected.borough || "Not listed"}</span>
                </div>
                <div>
                  <strong>Award Date</strong>
                  <span>{selected.awardDate || "Not listed"}</span>
                </div>
                <div>
                  <strong>Bid Amount</strong>
                  <span>{formatCurrency(selected.amountValue, selected.bidAmount)}</span>
                </div>
                <div>
                  <strong>Tenant</strong>
                  <span>{selected.tenantName || "Not listed"}</span>
                </div>
                <div>
                  <strong>Phone</strong>
                  <span>{selected.tenantPhone || "Not listed"}</span>
                </div>
                <div>
                  <strong>COA File</strong>
                  <span>{selected.coaFile || "Not matched"}</span>
                </div>
                <div>
                  <strong>ITB File</strong>
                  <span>{selected.itbFile || "Not matched"}</span>
                </div>
              </div>

              <div className="description-card">
                <strong>Description</strong>
                <p>{selected.description || "No description listed for this record."}</p>
              </div>

              <div className="detail-actions">
                <Link href={`/jobs/${encodeURIComponent(selected.id)}`} className="primary-link">
                  Open full job profile
                </Link>
                {buildMapsHref(selected) ? (
                  <a href={buildMapsHref(selected)} target="_blank" rel="noreferrer" className="secondary-link">
                    Open in Maps
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="detail-card">
              <p>No jobs match the current filters.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
