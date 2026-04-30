"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutomationRun } from "../lib/automation/types";

function fileHref(relativePath: string) {
  return `/api/automation/files/${relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function prettyDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusColor(status: AutomationRun["status"]) {
  switch (status) {
    case "completed":
      return "#0f766e";
    case "failed":
      return "#b91c1c";
    case "running":
      return "#1d4ed8";
    default:
      return "#6b7280";
  }
}

export function AutomationPanel() {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [days, setDays] = useState(4);
  const [maxResults, setMaxResults] = useState(200);

  const loadRuns = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/automation/runs?limit=10", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load automation runs.");
      }
      setRuns(Array.isArray(payload?.runs) ? payload.runs : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load runs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadRuns]);

  const activeRun = useMemo(
    () => runs.find((run) => run.status === "running" || run.status === "queued"),
    [runs],
  );

  const startRun = useCallback(async () => {
    try {
      setBusy(true);
      setError("");
      const response = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, maxResults }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to start automation run.");
      }
      await loadRuns();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to start run.");
    } finally {
      setBusy(false);
    }
  }, [days, maxResults, loadRuns]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        padding: 24,
        borderRadius: 16,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#6b7280" }}>
          Automation
        </p>
        <h1 style={{ margin: 0, fontSize: 28 }}>Bid fetch + fill control center</h1>
        <p style={{ margin: 0, color: "#4b5563", maxWidth: 820 }}>
          Start the legacy Gmail-to-PDF pipeline from the app, watch live run status,
          and download filled files without leaving the dashboard.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Lookback days</span>
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) || 4)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Max Gmail results</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxResults}
            onChange={(event) => setMaxResults(Number(event.target.value) || 200)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <button
          type="button"
          onClick={() => void startRun()}
          disabled={busy || Boolean(activeRun)}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: busy || activeRun ? "#9ca3af" : "#111827",
            color: "#ffffff",
            cursor: busy || activeRun ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {busy ? "Starting..." : activeRun ? "Run in progress" : "Start bid automation"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Recent runs</h2>
          <button
            type="button"
            onClick={() => void loadRuns()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {loading ? <p style={{ margin: 0 }}>Loading automation runs...</p> : null}

        {!loading && runs.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            No automation runs yet.
          </div>
        ) : null}

        {runs.map((run) => (
          <article
            key={run.runId}
            style={{
              display: "grid",
              gap: 12,
              padding: 16,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: "#fafafa",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 18 }}>{run.runId}</strong>
                <span style={{ color: "#4b5563" }}>Started {prettyDate(run.startedAt)}</span>
                <span style={{ color: "#4b5563" }}>Finished {prettyDate(run.finishedAt)}</span>
              </div>
              <span
                style={{
                  alignSelf: "start",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: `${statusColor(run.status)}15`,
                  color: statusColor(run.status),
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {run.status}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              }}
            >
              <Metric label="Fetched" value={run.counts.fetched} />
              <Metric label="Processed" value={run.counts.processed} />
              <Metric label="Filled" value={run.counts.filled} />
              <Metric label="Skipped" value={run.counts.skipped} />
              <Metric label="Failed" value={run.counts.failed} />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong>Worker query</strong>
              <code style={{ whiteSpace: "pre-wrap", color: "#374151" }}>{run.query}</code>
            </div>

            {run.files.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                <strong>Generated files</strong>
                <div style={{ display: "grid", gap: 6 }}>
                  {run.files.map((file) => (
                    <a
                      key={`${run.runId}-${file.relativePath}`}
                      href={fileHref(file.relativePath)}
                      style={{ color: "#1d4ed8", textDecoration: "none" }}
                    >
                      {file.name}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {run.error ? (
              <div style={{ color: "#991b1b", fontWeight: 600 }}>Error: {run.error}</div>
            ) : null}

            {run.logs.length ? (
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Run logs</summary>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 12,
                    background: "#111827",
                    color: "#f9fafb",
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {run.logs.join("\n")}
                </pre>
              </details>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: 12,
        borderRadius: 12,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
      }}
    >
      <span style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  );
}
