"use client";

import { useEffect, useState } from "react";

type RunRecord = {
  runId?: string;
  id?: string;
  status?: string;
  outputFiles?: string[];
  files?: string[];
  summary?: string;
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

function fileHref(file: string) {
  return `/api/automation/files/${file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function automationStatusMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("AUTOMATION_WORKER_URL")) {
    return "Automation worker not configured";
  }

  return `Worker/output API unavailable: ${message}`;
}

export default function OutputsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [status, setStatus] = useState("Loading outputs...");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/automation/runs", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`);
        }
        const rows = asRuns(payload);
        setRuns(rows);
        setStatus(rows.length ? `${rows.length} runs found` : "No runs yet");
      } catch (error) {
        console.error(error);
        setStatus(automationStatusMessage(error));
      }
    }

    load();
  }, []);

  return (
    <main className="hpd-output-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hpd-output-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-output-wrap {
          max-width: 900px;
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }

        .hpd-output-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .hpd-output-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(38px, 10vw, 66px);
          line-height: 0.92;
          letter-spacing: -0.08em;
        }

        .hpd-output-top p {
          margin: 0;
          color: #aebbd0;
        }

        .hpd-home-link,
        .hpd-file-link {
          color: #f8fbff;
          text-decoration: none;
        }

        .hpd-home-link {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 10px 12px;
          font-weight: 900;
        }

        .hpd-output-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 24px;
          padding: 16px;
        }

        .hpd-run-list {
          display: grid;
          gap: 10px;
        }

        .hpd-run-row {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          padding: 13px;
        }

        .hpd-run-row strong {
          display: block;
        }

        .hpd-run-row p {
          color: #aebbd0;
          margin: 5px 0 0;
          font-size: 13px;
        }

        .hpd-file-list {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }

        .hpd-file-link {
          display: block;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 10px;
          font-weight: 850;
        }
      `}</style>

      <section className="hpd-output-wrap">
        <header className="hpd-output-top">
          <div>
            <p>Outputs</p>
            <h1>Output Center</h1>
            <p>{status}</p>
          </div>
          <a className="hpd-home-link" href="/">
            Home
          </a>
        </header>

        <section className="hpd-output-card">
          <h2>Generated Files</h2>
          <p style={{ color: "#aebbd0" }}>
            Filled PDFs, invoices, and run logs appear here when the automation worker is reachable.
          </p>
        </section>

        <section className="hpd-run-list">
          {runs.length ? (
            runs.slice(0, 25).map((run, index) => {
              const files = run.outputFiles || run.files || [];

              return (
                <div className="hpd-run-row" key={`${run.runId || run.id || "run"}-${index}`}>
                  <strong>{run.runId || run.id || `Run ${index + 1}`}</strong>
                  <p>{run.status || "Unknown status"}</p>
                  <p>{run.summary || ""}</p>
                  {files.length ? (
                    <div className="hpd-file-list">
                      {files.map((file) => (
                        <a className="hpd-file-link" href={fileHref(file)} key={file}>
                          {file}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="hpd-run-row">
              <strong>No output runs visible</strong>
              <p>Run the fetcher/filler from Automation, then return here.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
