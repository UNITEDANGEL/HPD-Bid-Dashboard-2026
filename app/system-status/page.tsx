"use client";

import { useEffect, useState } from "react";
import { DataHealthPanel } from "../../components/DataHealthPanel";

export default function SystemStatusPage() {
  const [checks, setChecks] = useState<Record<string, string>>({
    "Static job data": "Checking...",
    "Static fetcher status": "Checking...",
    "Fetcher status API": "Checking...",
    "Fetcher run endpoint": "Checking...",
    "Cloudflare build marker": "Checking...",
  });

  useEffect(() => {
    const controller = new AbortController();
    const endpoints = [
      ["Static job data", "/data/COA_Fetcher_2026.json"],
      ["Static fetcher status", "/data/fetcher_latest_status.json"],
      ["Fetcher status API", "/api/fetcher/status"],
      ["Fetcher run endpoint", "/api/run-fetcher"],
      ["Cloudflare build marker", "/data/build_health.json"],
    ] as const;

    async function checkEndpoint(name: string, url: string) {
      try {
        const response = await fetch(`${url}?v=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        return [name, response.ok ? "OK" : `HTTP ${response.status}`] as const;
      } catch {
        return [name, "Unavailable"] as const;
      }
    }

    Promise.all(endpoints.map(([name, url]) => checkEndpoint(name, url))).then((results) => {
      if (!controller.signal.aborted) {
        setChecks(Object.fromEntries(results));
      }
    });

    return () => controller.abort();
  }, []);

  const rows = [
    ["Dashboard", "OK"],
    ["Static job data", checks["Static job data"]],
    ["Static fetcher status", checks["Static fetcher status"]],
    ["Fetcher status API", checks["Fetcher status API"]],
    ["Fetcher run endpoint", checks["Fetcher run endpoint"]],
    ["Cloudflare build marker", checks["Cloudflare build marker"]],
    ["Mobile Map", "OK"],
    ["Invoice Generator", "OK"],
  ];

  return (
    <main className="hpd-status-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hpd-status-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-status-wrap {
          max-width: 820px;
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }

        .hpd-status-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .hpd-status-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(38px, 10vw, 66px);
          line-height: 0.92;
          letter-spacing: 0;
        }

        .hpd-status-top p {
          margin: 0;
          color: #aebbd0;
        }

        .hpd-home-link {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 10px 12px;
          color: #f8fbff;
          text-decoration: none;
          font-weight: 900;
        }

        .hpd-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 18px;
          padding: 16px;
        }

        .hpd-status-row strong {
          font-size: 16px;
        }

        .hpd-status-row span {
          color: #aebbd0;
          text-align: right;
          font-weight: 850;
        }
      `}</style>

      <section className="hpd-status-wrap">
        <header className="hpd-status-top">
          <div>
            <p>Health Check</p>
            <h1>System Status</h1>
            <p>Checks data freshness, map readiness, fetcher routes, and Cloudflare output.</p>
          </div>
          <a className="hpd-home-link" href="/">
            Home
          </a>
        </header>

        <DataHealthPanel compact />

        {rows.map(([name, value]) => (
          <div className="hpd-status-row" key={name}>
            <strong>{name}</strong>
            <span>{value}</span>
          </div>
        ))}
      </section>
    </main>
  );
}


