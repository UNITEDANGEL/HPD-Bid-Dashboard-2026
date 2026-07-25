"use client";

import { useEffect, useState } from "react";

type RunRecord = {
  runId?: string;
  id?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  outputFiles?: string[];
  files?: string[];
};

function asRuns(value: unknown): RunRecord[] {
  if (Array.isArray(value)) return value as RunRecord[];

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.runs)) return obj.runs as RunRecord[];
    if (Array.isArray(obj.data)) return obj.data as RunRecord[];
    if (Array.isArray(obj.records)) return obj.records as RunRecord[];
  }

  return [];
}

function automationStatusMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("AUTOMATION_WORKER_URL")) {
    return "Automation worker not configured";
  }

  return `Worker/API unavailable: ${message}`;
}

export default function AutomationPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [status, setStatus] = useState("Checking worker...");
  const [running, setRunning] = useState("");
  const [log, setLog] = useState("");

  async function loadRuns() {
    try {
      const res = await fetch("/api/automation/runs", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`);
      }
      const rows = asRuns(payload);
      setRuns(rows);
      setStatus("Worker/API reachable");
    } catch (error) {
      console.error(error);
      setStatus(automationStatusMessage(error));
    }
  }

  async function run(mode: string) {
    setRunning(mode);
    setLog(`Starting ${mode}...`);

    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });

      const text = await res.text();

      try {
        setLog(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setLog(text);
      }

      if (!res.ok) {
        setStatus(`Run request failed: HTTP ${res.status}`);
      } else {
        setStatus(`${mode} request sent`);
      }

      await loadRuns();
    } catch (error) {
      console.error(error);
      setStatus("Run failed to contact worker/API");
      setLog(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning("");
    }
  }

  useEffect(() => {
    loadRuns();
  }, []);

  const actions = [
    ["fetch", "Fetch Latest HPD Bids", "Download latest bid PDFs from Gmail."],
    ["fill", "Fill Pending PDFs", "Run the PDF filler on pending documents."],
    ["invoice", "Generate Invoices", "Create invoice drafts from completed jobs."],
    ["full", "Run Full Pipeline", "Fetch, fill, log, and prepare outputs."],
  ];

  return (
    <main className="hpd-auto-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .hpd-auto-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-auto-wrap {
          max-width: 900px;
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }

        .hpd-auto-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .hpd-auto-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(38px, 10vw, 66px);
          line-height: 0.92;
          letter-spacing: -0.08em;
        }

        .hpd-auto-top p {
          margin: 0;
          color: #aebbd0;
        }

        .hpd-auto-home {
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 10px 12px;
          font-weight: 900;
        }

        .hpd-status-card,
        .hpd-action-card,
        .hpd-log-card,
        .hpd-runs-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 24px;
          padding: 16px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
        }

        .hpd-status-card strong {
          display: block;
          font-size: 22px;
          color: #53e69c;
        }

        .hpd-status-card span {
          color: #aebbd0;
        }

        .hpd-actions-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .hpd-action-card {
          min-height: 136px;
          text-align: left;
          color: #f8fbff;
          cursor: pointer;
        }

        .hpd-action-card button {
          width: 100%;
          height: 100%;
          background: transparent;
          border: 0;
          color: inherit;
          text-align: left;
          padding: 0;
          cursor: pointer;
        }

        .hpd-action-card h2 {
          margin: 0 0 8px;
          font-size: 21px;
          letter-spacing: -0.055em;
        }

        .hpd-action-card p {
          margin: 0;
          color: #aebbd0;
          line-height: 1.38;
        }

        .hpd-action-card .hpd-run-chip {
          display: inline-flex;
          margin-bottom: 12px;
          border-radius: 999px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          font-size: 12px;
          padding: 6px 9px;
        }

        .hpd-log-card pre {
          white-space: pre-wrap;
          word-break: break-word;
          color: #d9e9ff;
          margin: 0;
          max-height: 320px;
          overflow: auto;
        }

        .hpd-runs-list {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        .hpd-run-row {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          padding: 12px;
        }

        .hpd-run-row strong {
          display: block;
        }

        .hpd-run-row p {
          color: #aebbd0;
          margin: 4px 0 0;
          font-size: 13px;
        }

        @media (max-width: 760px) {
          .hpd-actions-grid {
            grid-template-columns: 1fr;
          }

          .hpd-auto-top {
            align-items: flex-start;
          }
        }
      `}</style>

      <section className="hpd-auto-wrap">
        <header className="hpd-auto-top">
          <div>
            <p>Automation</p>
            <h1>Fetcher / Filler</h1>
            <p>Run the existing Python pipeline from a clean mobile control panel.</p>
          </div>
          <a className="hpd-auto-home" href="/">
            Home
          </a>
        </header>

        <section className="hpd-status-card">
          <span>System Status</span>
          <strong>{status}</strong>
        </section>

        <section className="hpd-actions-grid">
          {actions.map(([mode, title, sub]) => (
            <div className="hpd-action-card" key={mode}>
              <button disabled={Boolean(running)} type="button" onClick={() => run(mode)}>
                <span className="hpd-run-chip">{running === mode ? "Running..." : "Run"}</span>
                <h2>{title}</h2>
                <p>{sub}</p>
              </button>
            </div>
          ))}
        </section>

        <section className="hpd-log-card">
          <h2>Run Log</h2>
          <pre>{log || "No run started yet."}</pre>
        </section>

        <section className="hpd-runs-card">
          <h2>Recent Runs</h2>
          <button type="button" onClick={loadRuns}>
            Refresh
          </button>
          <div className="hpd-runs-list">
            {runs.length ? (
              runs.slice(0, 12).map((run, index) => (
                <div className="hpd-run-row" key={`${run.runId || run.id || "run"}-${index}`}>
                  <strong>{run.runId || run.id || `Run ${index + 1}`}</strong>
                  <p>{run.status || "Unknown status"}</p>
                  <p>{run.summary || run.startedAt || run.finishedAt || ""}</p>
                </div>
              ))
            ) : (
              <div className="hpd-run-row">
                <strong>No runs visible</strong>
                <p>Start the worker, then refresh this page.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
