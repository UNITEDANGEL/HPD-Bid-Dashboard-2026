"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FetcherSummary = {
  rawRows?: number;
  rows2026?: number;
  mapped2026?: number;
  notMapped2026?: number;
  badDescriptions?: number;
  missingDescriptions?: number;
  missingItbJobs?: number;
  addedNewOmos?: number;
};

type FetcherStatus = {
  state?: string;
  ok?: boolean;
  startedAt?: string;
  finishedAt?: string;
  summary?: FetcherSummary;
};

type BuildHealth = {
  builtAt?: string;
  commit?: string;
  status?: FetcherStatus;
};

type JobRecord = {
  AwardDate?: string;
  awardDate?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  lat?: string | number;
  lng?: string | number;
  lon?: string | number;
};

type DataHealthPanelProps = {
  compact?: boolean;
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

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function is2026Job(job: JobRecord) {
  const awardDate = String(job.AwardDate || job.awardDate || "");
  return awardDate.includes("/26") || awardDate.includes("2026");
}

function hasValidNycCoords(job: JobRecord) {
  const lat = numberOrNull(job.Latitude ?? job.latitude ?? job.lat);
  const lng = numberOrNull(job.Longitude ?? job.longitude ?? job.lng ?? job.lon);

  return Boolean(
    lat !== null &&
      lng !== null &&
      lat >= 40.45 &&
      lat <= 40.95 &&
      lng >= -74.35 &&
      lng <= -73.65
  );
}

function formatDate(value?: string) {
  if (!value) return "Waiting";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waiting";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) return null;
  return response.json();
}

export function DataHealthPanel({ compact = false }: DataHealthPanelProps) {
  const [status, setStatus] = useState<FetcherStatus | null>(null);
  const [buildHealth, setBuildHealth] = useState<BuildHealth | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const cacheBust = Date.now();

    async function load() {
      try {
        const [apiStatus, staticStatus, jobsData, buildData] = await Promise.all([
          fetchJson(`/api/fetcher/status?v=${cacheBust}`, controller.signal).catch(() => null),
          fetchJson(`/data/fetcher_latest_status.json?v=${cacheBust}`, controller.signal).catch(() => null),
          fetchJson(`/data/COA_Fetcher_2026.json?v=${cacheBust}`, controller.signal).catch(() => null),
          fetchJson(`/data/build_health.json?v=${cacheBust}`, controller.signal).catch(() => null),
        ]);

        if (controller.signal.aborted) return;

        setStatus((apiStatus || staticStatus) as FetcherStatus | null);
        setBuildHealth(buildData as BuildHealth | null);
        setJobs(asArray(jobsData));
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const health = useMemo(() => {
    const rows2026FromJobs = jobs.filter(is2026Job);
    const summary = status?.summary || {};
    const sourceSummary = buildHealth?.status?.summary || summary;

    const rows2026 = numberOrNull(sourceSummary.rows2026) ?? rows2026FromJobs.length;
    const mapped2026 = numberOrNull(sourceSummary.mapped2026) ?? rows2026FromJobs.filter(hasValidNycCoords).length;
    const notMapped2026 =
      numberOrNull(sourceSummary.notMapped2026) ?? Math.max(0, rows2026 - mapped2026);
    const missingDescriptions = numberOrNull(sourceSummary.missingDescriptions) ?? 0;
    const missingItbJobs = numberOrNull(sourceSummary.missingItbJobs) ?? 0;
    const badDescriptions = numberOrNull(sourceSummary.badDescriptions) ?? 0;
    const dataIssues = notMapped2026 + missingDescriptions + missingItbJobs + badDescriptions;
    const sourceStatus = buildHealth?.status || status;

    return {
      rows2026,
      mapped2026,
      notMapped2026,
      dataIssues,
      addedNewOmos: numberOrNull(sourceSummary.addedNewOmos),
      isClean: Boolean(sourceStatus?.ok) && dataIssues === 0,
      lastFetch: formatDate(sourceStatus?.finishedAt || sourceStatus?.startedAt),
      builtAt: formatDate(buildHealth?.builtAt),
      commit: buildHealth?.commit ? buildHealth.commit.slice(0, 7) : "",
      state: sourceStatus?.state || "unknown",
    };
  }, [buildHealth, jobs, status]);

  const tiles = [
    ["Last fetch", health.lastFetch, health.state],
    ["Mapped 2026", `${health.mapped2026}/${health.rows2026}`, "map ready"],
    ["Geo gaps", String(health.notMapped2026), health.notMapped2026 ? "needs review" : "clear"],
    ["Build", health.builtAt, health.commit || "local"],
  ];

  return (
    <section className={`data-health ${compact ? "compact" : ""}`} aria-label="Data health">
      <style jsx>{`
        .data-health {
          display: grid;
          gap: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: rgba(9, 17, 32, 0.86);
          padding: 14px;
        }

        .data-health-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .data-health h2,
        .data-health p {
          margin: 0;
        }

        .data-health h2 {
          font-size: 18px;
          line-height: 1.1;
        }

        .data-health p {
          color: #aebbd0;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.35;
        }

        .data-health-state {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          border-radius: 999px;
          padding: 0 10px;
          background: ${health.isClean ? "rgba(83, 230, 156, 0.18)" : "rgba(255, 209, 102, 0.16)"};
          color: ${health.isClean ? "#b9ffd7" : "#ffe2a0"};
          border: 1px solid ${health.isClean ? "rgba(83, 230, 156, 0.34)" : "rgba(255, 209, 102, 0.28)"};
          font-size: 12px;
          font-weight: 950;
          white-space: nowrap;
        }

        .data-health-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .data-health-tile {
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          padding: 10px;
        }

        .data-health-tile span {
          display: block;
          color: #aebbd0;
          font-size: 11px;
          font-weight: 850;
        }

        .data-health-tile strong {
          display: block;
          margin-top: 4px;
          overflow-wrap: anywhere;
          color: #f8fbff;
          font-size: clamp(18px, 4vw, 24px);
          line-height: 1;
        }

        .data-health-tile small {
          display: block;
          margin-top: 5px;
          color: #8fd9ff;
          font-size: 11px;
          font-weight: 850;
        }

        .data-health-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .data-health-actions a {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          color: #f8fbff;
          background: rgba(255, 255, 255, 0.08);
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 900;
          text-decoration: none;
        }

        .data-health-error {
          color: #ffb3ba;
          font-weight: 850;
        }

        .compact .data-health-actions {
          display: none;
        }

        @media (max-width: 720px) {
          .data-health-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .data-health-top {
            display: grid;
          }
        }
      `}</style>

      <div className="data-health-top">
        <div>
          <h2>Data Health</h2>
          <p>{health.dataIssues ? `${health.dataIssues} items need review` : "Map data is clean"}</p>
        </div>
        <span className="data-health-state">{health.isClean ? "Clean" : "Review"}</span>
      </div>

      <div className="data-health-grid">
        {tiles.map(([label, value, detail]) => (
          <div className="data-health-tile" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      {error ? <p className="data-health-error">{error}</p> : null}

      <div className="data-health-actions">
        <Link href="/map">Open Map</Link>
        <Link href="/fetcher">Fetcher</Link>
        <Link href="/system-status">System</Link>
      </div>
    </section>
  );
}
