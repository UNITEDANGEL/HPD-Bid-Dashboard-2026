"use client";

import { useEffect, useState } from "react";

type FetcherStatus = {
  state?: string;
  ok?: boolean;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: {
    rawRows?: number;
    rows2026?: number;
    mapped2026?: number;
    notMapped2026?: number;
    badDescriptions?: number;
    missingDescriptions?: number;
    missingItbJobs?: number;
    fetchedCoaItems?: number;
    fetchedItbItems?: number;
    fetchedFinalJobRows?: number;
    addedNewOmos?: number;
    skippedExistingOmos?: number;
  };
  logTail?: string;
  environment?: {
    hasCredentialsJson?: boolean;
    hasTokenJson?: boolean;
    hasFetcherScript?: boolean;
  };
};

export default function FetcherPage() {
  const [status, setStatus] = useState<FetcherStatus>({});
  const [loading, setLoading] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [daysBack, setDaysBack] = useState(7);

  async function loadStatus() {
    const res = await fetch("/api/fetcher/status?v=" + Date.now(), { cache: "no-store" });
    const data = await res.json();
    setStatus(data);
  }

  async function runFetcher(days = daysBack) {
    const safeDays = Math.min(95, Math.max(1, Math.floor(Number(days) || 7)));
    setLoading(true);
    setRunMessage("");
    try {
      const res = await fetch("/api/fetcher/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: safeDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunMessage(data.error || "Fetcher failed to start.");
      } else {
        setRunMessage(data.message || `Fetcher ${safeDays}-day run started.`);
      }
      await loadStatus();
    } catch (err: any) {
      setRunMessage(err.message || "Fetcher failed to start.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 10000);
    return () => clearInterval(id);
  }, []);

  const summary = status.summary || {};

  return (
    <main className="fetcher-page">
      <section className="hero">
        <p className="eyebrow">HPD Bid Dashboard</p>
        <h1>Fetcher Control</h1>
        <p>
          Run the safe 7-day fetcher update, merge new jobs, geocode, recover ITBs,
          recover descriptions, and verify dashboard counts.
        </p>

        <div className="actions">
                    <div className="days-picker">
            <label>
              Days back
              <input
                type="number"
                min="1"
                max="95"
                value={daysBack}
                onChange={(event) => setDaysBack(Math.min(95, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
            <button type="button" onClick={() => runFetcher(daysBack)} disabled={loading || status.state === "running"}>
              {loading || status.state === "running" ? "Fetcher Running..." : `Run ${daysBack}-Day Fetch`}
            </button>
          </div>
          <button type="button" className="secondary" onClick={() => { setDaysBack(7); runFetcher(7); }} disabled={loading || status.state === "running"}>
            7-Day Update
          </button>
          <button type="button" className="secondary" onClick={() => { setDaysBack(30); runFetcher(30); }} disabled={loading || status.state === "running"}>
            30-Day Catch-Up
          </button>
          <button type="button" className="secondary" onClick={() => { setDaysBack(60); runFetcher(60); }} disabled={loading || status.state === "running"}>
            60-Day Deep Scan
          </button>
          <button type="button" className="secondary" onClick={loadStatus}>
            Refresh Status
          </button>
          <a href="/map">Open Map</a>
        </div>

        {runMessage ? <p className="message">{runMessage}</p> : null}
      </section>

      <section className={`status-card ${status.ok ? "ok" : "warn"}`}>
        <h2>Status: {status.state || "unknown"}</h2>
                {status.error ? <p className="error">{status.error}</p> : null}
        {status.state === "complete" ? (
          <div className="cleanup-alert">
            <strong>Fetcher Complete</strong>
            <span>{summary.notMapped2026 ?? 0} need geo · {summary.missingDescriptions ?? 0} missing descriptions · {summary.missingItbJobs ?? 0} missing ITB</span>
          </div>
        ) : null}

        <div className="grid">
          <div><span>Fetched COAs</span><strong>{summary.fetchedCoaItems ?? "—"}</strong></div>
          <div><span>Fetched ITBs</span><strong>{summary.fetchedItbItems ?? "—"}</strong></div>
          <div><span>Fetcher Rows</span><strong>{summary.fetchedFinalJobRows ?? "—"}</strong></div>
          <div><span>New Added</span><strong>{summary.addedNewOmos ?? "—"}</strong></div>
          <div><span>Skipped Existing</span><strong>{summary.skippedExistingOmos ?? "—"}</strong></div>
          <div><span>2026 Jobs</span><strong>{summary.rows2026 ?? "—"}</strong></div>
          <div><span>Mapped</span><strong>{summary.mapped2026 ?? "—"}</strong></div>
          <div><span>Need Geo</span><strong>{summary.notMapped2026 ?? "—"}</strong></div>
          <div><span>Missing ITB</span><strong>{summary.missingItbJobs ?? "—"}</strong></div>
          <div><span>Missing Desc</span><strong>{summary.missingDescriptions ?? "—"}</strong></div>
          <div><span>Bad Desc</span><strong>{summary.badDescriptions ?? "—"}</strong></div>
        </div>

        <div className="env">
          <p>Credentials: {status.environment?.hasCredentialsJson ? "Found" : "Missing"}</p>
          <p>Token: {status.environment?.hasTokenJson ? "Found" : "Missing"}</p>
          <p>Fetcher Script: {status.environment?.hasFetcherScript ? "Found" : "Missing"}</p>
        </div>
      </section>

      <section className="log-card">
        <h2>Latest Log</h2>
        <pre>{status.logTail || "No log yet."}</pre>
      </section>

      <style jsx>{`
        .fetcher-page {
          min-height: 100vh;
          padding: 24px;
          background: radial-gradient(circle at top, #16233f, #050812 58%);
          color: #f7f8ff;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hero,
        .status-card,
        .log-card {
          max-width: 980px;
          margin: 0 auto 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          background: rgba(8, 14, 26, 0.82);
          box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
          padding: 22px;
          backdrop-filter: blur(18px);
        }

        .eyebrow {
          color: #76a9ff;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 12px;
          font-weight: 800;
        }

        h1 {
          font-size: clamp(32px, 7vw, 58px);
          margin: 4px 0 10px;
        }

        h2 {
          margin: 0 0 14px;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 18px;
        }

        button,
        a {
          border: 0;
          border-radius: 999px;
          padding: 13px 18px;
          font-weight: 800;
          color: #06101f;
          background: linear-gradient(135deg, #6fb4ff, #27e2b6);
          cursor: pointer;
          text-decoration: none;
        }

        button.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #f7f8ff;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .message {
          margin-top: 12px;
          color: #9ddcff;
          font-weight: 700;
        }

        .status-card.ok {
          border-color: rgba(39, 226, 182, 0.38);
        }

        .status-card.warn {
          border-color: rgba(255, 198, 92, 0.34);
        }

        .error {
          color: #ff9a9a;
          font-weight: 800;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
        }

        .grid div {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 18px;
          padding: 16px;
        }

        .grid span,
        .env p {
          color: #aeb9d6;
          font-size: 13px;
        }

        .grid strong {
          display: block;
          font-size: 28px;
          margin-top: 6px;
        }

        .env {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 16px;
        }

        .cleanup-alert {
          margin: 14px 0 16px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255, 209, 102, 0.34);
          background: rgba(255, 209, 102, 0.10);
          display: grid;
          gap: 4px;
        }
        .cleanup-alert strong {
          color: #ffe7a3;
          font-size: 16px;
        }
        .cleanup-alert span {
          color: #f7f8ff;
          font-weight: 800;
        }
        pre {
          max-height: 520px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          color: #dbe7ff;
          background: #050812;
          border-radius: 18px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </main>
  );
}





