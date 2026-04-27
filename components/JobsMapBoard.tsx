"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { JobRecord } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  jobs: JobRecord[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildMapsHref(job: JobRecord) {
  const coords = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : "";
  const query = coords || job.address || job.location;
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildEmbed(job: JobRecord) {
  const lat = Number(job.latitude);
  const lng = Number(job.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const delta = 0.01;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
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

  const embedUrl = selected ? buildEmbed(selected) : "";

  return (
    <main style={{ padding: 16, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16, background: "#fff" }}>
        <h1 style={{ margin: 0 }}>HPD Job Map</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          {filtered.length} mapped jobs from the live merged dataset
        </p>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr", marginTop: 16 }}>
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OMO, address, trade"
              style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
            />
          </label>

          <label>
            Borough
            <select
              value={borough}
              onChange={(event) => setBorough(event.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
            >
              <option value="">All boroughs</option>
              {boroughs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "1.3fr 0.9fr" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 16, overflow: "hidden", background: "#fff", minHeight: 520 }}>
          {embedUrl ? (
            <iframe
              title="HPD Jobs Map"
              src={embedUrl}
              style={{ width: "100%", height: "70vh", minHeight: 520, border: 0, display: "block" }}
            />
          ) : (
            <div style={{ padding: 24 }}>No mapped jobs available for the current filters.</div>
          )}
        </div>

        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {selected ? (
            <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selected.id}</h2>
                  <div style={{ marginTop: 6 }}>{selected.address || "No address listed"}</div>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <div><strong>Borough:</strong> {selected.borough || "Not listed"}</div>
                <div><strong>Trade:</strong> {selected.trade || "Not listed"}</div>
                <div><strong>Award Date:</strong> {selected.awardDate || "Not listed"}</div>
                <div><strong>Tenant:</strong> {selected.tenantName || "Not listed"}</div>
                <div><strong>Phone:</strong> {selected.tenantPhone || "Not listed"}</div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <Link
                  href={`/jobs/${encodeURIComponent(selected.id)}`}
                  style={{ padding: "10px 14px", borderRadius: 10, textDecoration: "none", border: "1px solid #111", color: "#111" }}
                >
                  Open Job Profile
                </Link>
                {buildMapsHref(selected) ? (
                  <a
                    href={buildMapsHref(selected)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ padding: "10px 14px", borderRadius: 10, textDecoration: "none", border: "1px solid #111", color: "#111" }}
                  >
                    Open in Maps
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, maxHeight: "70vh", overflow: "auto" }}>
            {filtered.map((job) => (
              <button
                key={`${job.id}-${job.address}`}
                type="button"
                onClick={() => setSelectedId(job.id)}
                style={{
                  textAlign: "left",
                  border: selected?.id === job.id ? "2px solid #111" : "1px solid #ddd",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{job.id}</strong>
                  <StatusBadge status={job.status} />
                </div>
                <div style={{ marginTop: 8 }}>{job.address || "No address listed"}</div>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  {job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
