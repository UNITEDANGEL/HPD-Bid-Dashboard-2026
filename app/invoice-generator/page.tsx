"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PAPERWORK_OUTCOMES,
  type PaperworkOutcome,
  applySavedWorkflowStatuses,
  defaultPaperworkInvoiceNo,
  formatCurrency,
  getJobAddress,
  getJobAmount,
  getJobId,
  getJobWorkflowStatus,
  invoiceDescriptionForOutcome,
  isNoWorkOutcome,
  noWorkServiceChargeForJob,
  paperworkOutcomeFromJob,
  paperworkOutcomeFromValue,
} from "../../lib/paperwork";

type JobRecord = Record<string, unknown>;

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

export default function InvoiceGeneratorPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [queryJobId, setQueryJobId] = useState("");
  const [outcome, setOutcome] = useState<PaperworkOutcome>("pending");
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [form, setForm] = useState({
    invoiceNo: defaultPaperworkInvoiceNo(),
    customer: "HPD / OMO",
    jobId: "",
    address: "",
    description: "Select a job to prepare the invoice from ITB / COA data.",
    amount: "",
    sourceStatus: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const res = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        const rows = await applySavedWorkflowStatuses(asArray(data));
        if (!cancelled) setJobs(rows);
      } catch (error) {
        console.error(error);
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || loadedQuery) return;

    const params = new URLSearchParams(window.location.search);
    const job = params.get("job") || "";
    const nextOutcome = paperworkOutcomeFromValue(params.get("outcome") || "");

    setQueryJobId(job);
    setSelectedId(job);
    setOutcome(nextOutcome);
    setLoadedQuery(true);
  }, [loadedQuery]);

  useEffect(() => {
    if (!queryJobId || !jobs.length) return;
    chooseJob(queryJobId, outcome);
  }, [jobs, queryJobId]);

  const selectedJob = useMemo(
    () => jobs.find((job, index) => getJobId(job, String(index)) === selectedId) || null,
    [jobs, selectedId]
  );

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function chooseJob(id: string, nextOutcome = outcome) {
    setSelectedId(id);
    const job = jobs.find((item, index) => getJobId(item, String(index)) === id);
    if (!job) return;
    const resolvedOutcome = nextOutcome === "pending" ? paperworkOutcomeFromJob(job) : nextOutcome;

    setOutcome(resolvedOutcome);
    setForm((prev) => ({
      ...prev,
      invoiceNo: defaultPaperworkInvoiceNo(getJobId(job)),
      jobId: getJobId(job),
      address: getJobAddress(job),
      description: invoiceDescriptionForOutcome(job, resolvedOutcome),
      amount: isNoWorkOutcome(resolvedOutcome) ? formatCurrency(noWorkServiceChargeForJob(job)) : formatCurrency(getJobAmount(job)) || prev.amount,
      sourceStatus: getJobWorkflowStatus(job),
    }));
  }

  function chooseOutcome(value: string) {
    const nextOutcome = paperworkOutcomeFromValue(value);
    setOutcome(nextOutcome);
    setForm((prev) => ({
      ...prev,
      description: invoiceDescriptionForOutcome(selectedJob, nextOutcome),
      amount: isNoWorkOutcome(nextOutcome) ? formatCurrency(noWorkServiceChargeForJob(selectedJob)) : selectedJob ? formatCurrency(getJobAmount(selectedJob)) || prev.amount : prev.amount,
    }));
  }

  const resolvedPaperworkOutcome = outcome === "pending" ? paperworkOutcomeFromJob(selectedJob) : outcome;
  const paperworkHref = `/paperwork?job=${encodeURIComponent(form.jobId || selectedId)}&outcome=${encodeURIComponent(resolvedPaperworkOutcome)}`;

  return (
    <main className="hpd-invoice-shell">
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

        .hpd-invoice-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 28rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
        }

        .hpd-invoice-wrap {
          max-width: 980px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 14px;
        }

        .hpd-invoice-top {
          grid-column: 1 / -1;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .hpd-invoice-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(38px, 10vw, 66px);
          line-height: 0.92;
          letter-spacing: -0.08em;
        }

        .hpd-invoice-top p {
          color: #aebbd0;
          margin: 0;
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

        .hpd-invoice-form,
        .hpd-invoice-preview {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 24px;
          padding: 16px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
        }

        .hpd-invoice-form {
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .hpd-invoice-form label {
          display: grid;
          gap: 7px;
          color: #aebbd0;
          font-weight: 850;
          font-size: 13px;
        }

        .hpd-invoice-form input,
        .hpd-invoice-form select,
        .hpd-invoice-form textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 15px;
          padding: 13px;
          font-size: 16px;
          outline: none;
        }

        .hpd-invoice-form textarea {
          min-height: 108px;
          resize: vertical;
        }

        .hpd-print-button {
          border: 0;
          border-radius: 16px;
          min-height: 54px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          font-size: 15px;
          cursor: pointer;
        }

        .hpd-package-link {
          display: block;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 16px;
          padding: 14px;
          text-align: center;
          text-decoration: none;
          font-weight: 950;
        }

        .hpd-source-status {
          margin: 0;
          border: 1px solid rgba(255, 209, 102, 0.28);
          background: rgba(255, 209, 102, 0.1);
          color: #ffe8a3;
          border-radius: 12px;
          padding: 11px 12px;
          font-weight: 850;
        }

        .hpd-invoice-sheet {
          background: #ffffff;
          color: #111827;
          border-radius: 20px;
          padding: 24px;
          min-height: 560px;
        }

        .hpd-invoice-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
        }

        .hpd-invoice-head h2 {
          margin: 0;
          font-size: 36px;
          letter-spacing: -0.055em;
        }

        .hpd-invoice-head p {
          margin: 4px 0 0;
          color: #4b5563;
        }

        .hpd-invoice-rule {
          border: 0;
          border-top: 1px solid #d1d5db;
          margin: 24px 0;
        }

        .hpd-invoice-table {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          overflow: hidden;
          margin-top: 20px;
        }

        .hpd-invoice-table-row {
          display: grid;
          grid-template-columns: 1fr 150px;
        }

        .hpd-invoice-table-row.header {
          background: #f3f4f6;
          font-weight: 950;
        }

        .hpd-invoice-table-row > div {
          padding: 13px;
        }

        .hpd-invoice-total {
          margin-top: 20px;
          text-align: right;
          font-size: 26px;
          font-weight: 950;
        }

        @media (max-width: 860px) {
          .hpd-invoice-wrap {
            grid-template-columns: 1fr;
          }
        }

        @media print {
          .hpd-invoice-top,
          .hpd-invoice-form {
            display: none !important;
          }

          .hpd-invoice-shell {
            background: #ffffff !important;
            padding: 0 !important;
          }

          .hpd-invoice-wrap {
            display: block !important;
            max-width: none !important;
          }

          .hpd-invoice-preview {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .hpd-invoice-sheet {
            border-radius: 0 !important;
            min-height: auto !important;
          }
        }
      `}</style>

      <section className="hpd-invoice-wrap">
        <header className="hpd-invoice-top">
          <div>
            <p>Invoice Generator</p>
            <h1>Create invoice drafts</h1>
            <p>Select a job, confirm details, then print or save as PDF.</p>
          </div>
          <a className="hpd-home-link" href="/">
            Home
          </a>
        </header>

        <section className="hpd-invoice-form">
          <label>
            Select Job
            <select value={selectedId} onChange={(event) => chooseJob(event.target.value)}>
              <option value="">Manual invoice</option>
              {jobs.slice(0, 500).map((job, index) => (
                <option value={getJobId(job, String(index))} key={`${getJobId(job, "job")}-${index}`}>
                  {getJobId(job, `Job ${index + 1}`)} - {getJobAddress(job) || "No address"}
                </option>
              ))}
            </select>
          </label>

          <label>
            Field Outcome
            <select value={outcome} onChange={(event) => chooseOutcome(event.target.value)}>
              {PAPERWORK_OUTCOMES.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {form.sourceStatus ? (
            <p className="hpd-source-status">
              Saved status: <strong>{form.sourceStatus}</strong>
            </p>
          ) : null}

          <label>
            Invoice Number
            <input value={form.invoiceNo} onChange={(event) => update("invoiceNo", event.target.value)} />
          </label>

          <label>
            Customer
            <input value={form.customer} onChange={(event) => update("customer", event.target.value)} />
          </label>

          <label>
            Job / OMO ID
            <input value={form.jobId} onChange={(event) => update("jobId", event.target.value)} />
          </label>

          <label>
            Address
            <input value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>

          <label>
            Description
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>

          <label>
            Amount
            <input value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="$0.00" />
          </label>

          <button className="hpd-print-button" type="button" onClick={() => window.print()}>
            Print / Save PDF
          </button>

          <a className="hpd-package-link" href={paperworkHref}>
            Open affidavit + invoice package
          </a>
        </section>

        <section className="hpd-invoice-preview">
          <div className="hpd-invoice-sheet">
            <div className="hpd-invoice-head">
              <div>
                <h2>INVOICE</h2>
                <p>United Angel Construction Corp.</p>
                <p>12017 91st Ave, Richmond Hill, NY 11418</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>{form.invoiceNo}</strong>
                <p>{new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <hr className="hpd-invoice-rule" />

            <p>
              <strong>Bill To:</strong> {form.customer}
            </p>
            <p>
              <strong>Job ID:</strong> {form.jobId || getJobId(selectedJob || undefined) || "Not entered"}
            </p>
            <p>
              <strong>Address:</strong> {form.address || getJobAddress(selectedJob || undefined) || "Not entered"}
            </p>

            <div className="hpd-invoice-table">
              <div className="hpd-invoice-table-row header">
                <div>Description</div>
                <div>Amount</div>
              </div>
              <div className="hpd-invoice-table-row">
                <div>{form.description || "Work completed per HPD bid / work order."}</div>
                <div>
                  <strong>{form.amount || "$0.00"}</strong>
                </div>
              </div>
            </div>

            <div className="hpd-invoice-total">Total: {form.amount || "$0.00"}</div>
          </div>
        </section>
      </section>
    </main>
  );
}


