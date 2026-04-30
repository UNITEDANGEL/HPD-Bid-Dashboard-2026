"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JobRecord } from "../lib/types";

type Props = {
  jobs: JobRecord[];
};

const JobsMap = dynamic(
  () => import("./JobsMap").then((mod) => mod.JobsMap),
  {
    ssr: false,
    loading: () => <div className="map-skeleton">Loading live job map...</div>,
  },
);

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildMapsHref(job: JobRecord) {
  const coords = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : "";
  const query = coords || job.address || job.location;
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildJobHref(job: JobRecord) {
  if (!job.id) return "/jobs";
  return `/jobs/${encodeURIComponent(job.id)}`;
}

export function JobsMapBoard({ jobs }: Props) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const mappableJobs = useMemo(() => jobs.filter((job) => job.hasMap), [jobs]);
  const boroughs = unique(mappableJobs.map((job) => job.borough));

  const filtered = mappableJobs.filter((job) => {
    if (borough && job.borough !== borough) return false;
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

  const selected =
    filtered.find((job) => job.id === selectedId) ||
    filtered[0] ||
    mappableJobs[0] ||
    null;

  return (
    <main className="page-stack">
      <section className="filters-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Map Only</p>
            <h2>HPD job map command board</h2>
          </div>
          <span className="section-chip">{filtered.length} mapped jobs</span>
        </div>
        <p className="hero-copy map-copy">
          Use this focused map screen for fast borough scanning, marker review, and jumping into individual job packets.
        </p>

        <div className="filters-grid">
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OMO, address, trade"
            />
          </label>

          <label>
            Borough
            <select
              value={borough}
              onChange={(event) => setBorough(event.target.value)}
            >
              <option value="">All boroughs</option>
              {boroughs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Selected
            <input value={selected?.id || ""} readOnly placeholder="Tap a marker or job card" />
          </label>
        </div>
      </section>

      <section className="map-stage">
        <div className="map-stage-grid">
          <div className="map-shell map-shell-tall">
            {filtered.length ? (
              <JobsMap jobs={filtered} selectedId={selected?.id || ""} onSelect={setSelectedId} />
            ) : (
              <div className="map-empty">
                <strong>No mapped jobs available for the current filters.</strong>
                <span>Broaden the borough or search filter to restore the map results.</span>
              </div>
            )}
          </div>

          <div className="map-sidecard map-sidecard-scroll">
            {selected ? (
              <>
                <div className="map-sidecard-header">
                  <div>
                    <p className="eyebrow">Map Focus</p>
                    <h3>{selected.id}</h3>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <p className="map-side-address">{selected.address || "No address listed"}</p>

                <div className="map-kpi-grid">
                  <div className="map-kpi">
                    <span>Borough</span>
                    <strong>{selected.borough || "Not listed"}</strong>
                  </div>
                  <div className="map-kpi">
                    <span>Trade</span>
                    <strong>{selected.trade || "Not listed"}</strong>
                  </div>
                  <div className="map-kpi">
                    <span>Award Date</span>
                    <strong>{selected.awardDate || "Not listed"}</strong>
                  </div>
                  <div className="map-kpi">
                    <span>Tenant</span>
                    <strong>{selected.tenantName || "Not listed"}</strong>
                  </div>
                </div>

                <div className="description-card map-description-card">
                  <strong>Description</strong>
                  <p>{selected.description || "No description listed for this record."}</p>
                </div>

                <div className="detail-actions">
                  <Link href={buildJobHref(selected)} className="primary-link">
                    Open job profile
                  </Link>
                  {buildMapsHref(selected) ? (
                    <a href={buildMapsHref(selected)} target="_blank" rel="noreferrer" className="secondary-link">
                      Open in Maps
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="map-empty">
                <strong>No mapped jobs are available.</strong>
              </div>
            )}
          </div>
        </div>

        <div className="jobs-grid">
          {filtered.map((job) => (
            <button
              key={`${job.id}-${job.address}`}
              type="button"
              onClick={() => setSelectedId(job.id)}
              className={`job-card ${selected?.id === job.id ? "is-selected" : ""}`}
            >
              <div className="job-card-top">
                <strong>{job.id}</strong>
                <StatusBadge status={job.status} />
              </div>
              <p className="job-address">{job.address || "No address listed"}</p>
              <p className="job-meta">
                {job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}
              </p>
              <div className="job-card-bottom">
                <span>{job.bidAmount || "Not listed"}</span>
                <span>{job.awardDate || "No award date"}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
