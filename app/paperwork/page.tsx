"use client";

import { useEffect, useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  PAPERWORK_OUTCOMES,
  type PaperworkOutcome,
  NO_WORK_SERVICE_CHARGE,
  affidavitReasonForOutcome,
  affidavitTemplateLabel,
  applySavedWorkflowStatuses,
  defaultPaperworkInvoiceNo,
  formatCurrency,
  getJobAddress,
  getJobAmount,
  getJobBorough,
  getJobDate,
  getJobDescription,
  getJobId,
  getJobLocation,
  getJobWorkflowStatus,
  invoiceDescriptionForOutcome,
  isNoWorkOutcome,
  paperworkOutcomeFromJob,
  paperworkOutcomeFromValue,
} from "../../lib/paperwork";

type JobRecord = Record<string, unknown>;

type PackageForm = {
  invoiceNo: string;
  invoiceDate: string;
  contractor: string;
  customer: string;
  jobId: string;
  address: string;
  location: string;
  borough: string;
  amount: string;
  bidAmount: string;
  description: string;
  affidavitType: string;
  affidavitReason: string;
  fieldDate: string;
  firstAttempt: string;
  secondAttempt: string;
  workStart: string;
  workComplete: string;
  signer: string;
  sourceStatus: string;
  notes: string;
};

const WORK_AFFIDAVIT_TEMPLATE = "/templates/work-completed-affidavit.pdf";
const NO_WORK_AFFIDAVIT_TEMPLATE = "/templates/no-work-completed-affidavit.pdf";
const BLANK_WORK_AFFIDAVIT_TEMPLATE = "/templates/blank-work-completed-affidavit-with-invoice.pdf";
const BLANK_NO_WORK_AFFIDAVIT_TEMPLATE = "/templates/blank-no-work-completed-affidavit-with-invoice.pdf";

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateValue(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function displayDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = parseDateValue(raw);
  if (!parsed) return raw;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = String(parsed.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function monthName(value: string) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleString("en-US", { month: "long" }).toUpperCase() : "";
}

function dayOfMonth(value: string) {
  const parsed = parseDateValue(value);
  return parsed ? String(parsed.getDate()).padStart(2, "0") : "";
}

function initialForm(): PackageForm {
  return {
    invoiceNo: defaultPaperworkInvoiceNo(),
    invoiceDate: todayIsoDate(),
    contractor: "United Angel Construction Corp.",
    customer: "HPD / OMO",
    jobId: "",
    address: "",
    location: "",
    borough: "",
    amount: "",
    bidAmount: "",
    description: "Select a job and field outcome to prepare paperwork.",
    affidavitType: affidavitTemplateLabel("pending"),
    affidavitReason: affidavitReasonForOutcome("pending"),
    fieldDate: todayIsoDate(),
    firstAttempt: "",
    secondAttempt: "",
    workStart: "",
    workComplete: "",
    signer: "",
    sourceStatus: "",
    notes: "",
  };
}

function formFromJob(job: JobRecord, outcome: PaperworkOutcome): PackageForm {
  const jobId = getJobId(job);
  const firstAttemptAt = String(job.NoAccessFirstAttemptAt || job.noAccessFirstAttemptAt || "").trim();
  const secondAttemptAt = String(job.NoAccessSecondAttemptAt || job.noAccessSecondAttemptAt || "").trim();
  const refusedAt = String(job.RefusalDate || job.refusalDate || "").trim();
  const verifiedByOthersAt = String(job.VerifiedByOthersDate || job.verifiedByOthersDate || "").trim();
  const actualStartAt = String(job.ActualWorkStartDate || job.actualWorkStartDate || "").trim();
  const actualCompleteAt = String(job.ActualWorkCompletionDate || job.actualWorkCompletionDate || "").trim();
  const lockedAt = String(job.OutcomeLockedAt || job.outcomeLockedAt || "").trim();
  const sourceStatus = getJobWorkflowStatus(job);
  const fieldDate = lockedAt || secondAttemptAt || refusedAt || verifiedByOthersAt || actualCompleteAt || firstAttemptAt;
  const noWorkCompleteAt = secondAttemptAt || refusedAt || verifiedByOthersAt || lockedAt;
  const workCompleteAt = actualCompleteAt || lockedAt || getJobDate(job, "complete");
  const bidAmount = formatCurrency(getJobAmount(job));
  const chargeAmount = isNoWorkOutcome(outcome) ? formatCurrency(NO_WORK_SERVICE_CHARGE) : bidAmount;

  return {
    ...initialForm(),
    invoiceNo: defaultPaperworkInvoiceNo(jobId),
    jobId,
    address: getJobAddress(job),
    location: getJobLocation(job),
    borough: getJobBorough(job),
    amount: chargeAmount,
    bidAmount,
    description: invoiceDescriptionForOutcome(job, outcome),
    affidavitType: affidavitTemplateLabel(outcome),
    affidavitReason: affidavitReasonForOutcome(outcome),
    fieldDate: displayDate(fieldDate) || todayIsoDate(),
    firstAttempt: displayDate(firstAttemptAt || (outcome === "no_access" ? lockedAt : "")),
    secondAttempt: displayDate(noWorkCompleteAt),
    workStart: displayDate(actualStartAt || getJobDate(job, "start")),
    workComplete: displayDate(outcome === "work_completed" || outcome === "partial_work_completed" ? workCompleteAt : noWorkCompleteAt),
    sourceStatus,
    notes: getJobDescription(job).slice(0, 650),
  };
}

function cleanAmount(value: string) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "").trim();
  return cleaned || "0";
}

function amountNumber(value: string) {
  const parsed = Number(cleanAmount(value).replace(/[()]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pdfMoney(value: number | string, negativeStyle = false) {
  const numeric = typeof value === "number" ? value : amountNumber(value);
  const formatted = Math.abs(numeric).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (negativeStyle && numeric < 0) return `(${formatted})`;
  return formatted;
}

function upper(value: string) {
  return String(value || "").toUpperCase();
}

function oathSigner(value: string) {
  const raw = String(value || "JOTJAGRAJ SINGH").trim();
  return raw
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

const WORK_MATERIALS = ["TRASH BAG", "WD 40", "SELF SCREWS", "PLEASE SEE ATTACHED DESCRIPTION", "", "ADJUSTMENTS/ ALIGNMENT"];
const PARTIAL_MATERIALS = ["TRASH BAG", "WD 40", "SELF SCREWS", "PLEASE SEE ATTACHED DESCRIPTION", "STRIKE PLATE", "ADJUST AND ALIGN"];

function safeFilename(value: string) {
  return String(value || "HPD")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function findJob(rows: JobRecord[], id: string) {
  const target = id.trim().toLowerCase();
  if (!target) return null;

  return (
    rows.find((job) => {
      const candidates = [getJobId(job), String(job.OMO || ""), String(job.omo || ""), String(job.id || "")];
      return candidates.some((candidate) => candidate.trim().toLowerCase() === target);
    }) || null
  );
}

export default function PaperworkPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [outcome, setOutcome] = useState<PaperworkOutcome>("pending");
  const [form, setForm] = useState<PackageForm>(initialForm);
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");

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

    setSelectedId(job);
    setOutcome(nextOutcome);
    setForm((current) => ({
      ...current,
      affidavitType: affidavitTemplateLabel(nextOutcome),
      affidavitReason: affidavitReasonForOutcome(nextOutcome),
      description: invoiceDescriptionForOutcome(null, nextOutcome),
    }));
    setLoadedQuery(true);
  }, [loadedQuery]);

  useEffect(() => {
    if (!selectedId || !jobs.length) return;
    const job = findJob(jobs, selectedId);
    if (!job) return;
    const selectedOutcome = outcome === "pending" ? paperworkOutcomeFromJob(job) : outcome;
    setOutcome(selectedOutcome);
    setForm(formFromJob(job, selectedOutcome));
  }, [jobs, selectedId]);

  const selectedJob = useMemo(() => findJob(jobs, selectedId), [jobs, selectedId]);

  function chooseJob(id: string) {
    setSelectedId(id);
    const job = findJob(jobs, id);
    if (!job) return;

    const nextOutcome = outcome === "pending" ? paperworkOutcomeFromJob(job) : outcome;
    setOutcome(nextOutcome);
    setForm(formFromJob(job, nextOutcome));
  }

  function chooseOutcome(value: string) {
    const nextOutcome = paperworkOutcomeFromValue(value);
    setOutcome(nextOutcome);
    setForm((current) => ({
      ...current,
      amount: isNoWorkOutcome(nextOutcome) ? formatCurrency(NO_WORK_SERVICE_CHARGE) : current.bidAmount || current.amount,
      description: invoiceDescriptionForOutcome(selectedJob, nextOutcome),
      affidavitType: affidavitTemplateLabel(nextOutcome),
      affidavitReason: affidavitReasonForOutcome(nextOutcome),
    }));
  }

  function update(key: keyof PackageForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function generateAffidavitPdf() {
    const useWorkTemplate = outcome === "work_completed" || outcome === "partial_work_completed";
    const templateUrl = useWorkTemplate ? WORK_AFFIDAVIT_TEMPLATE : NO_WORK_AFFIDAVIT_TEMPLATE;
    const jobId = form.jobId || selectedId || "HPD";
    const bidValue = amountNumber(form.bidAmount || form.amount);
    const chargeValue = amountNumber(form.amount || form.bidAmount);
    const bidAmount = pdfMoney(bidValue);
    const chargeAmount = pdfMoney(chargeValue);
    const changeAmount = outcome === "partial_work_completed"
      ? pdfMoney(Math.max(0, bidValue - chargeValue))
      : isNoWorkOutcome(outcome)
        ? pdfMoney(chargeValue - bidValue, true)
        : "0.00";
    const fieldDate = form.fieldDate || form.workComplete || todayIsoDate();
    const firstAttempt = form.firstAttempt || fieldDate;
    const secondAttempt = form.secondAttempt || fieldDate;
    const invoiceDate = useWorkTemplate ? form.workComplete || fieldDate : secondAttempt;
    const signer = form.signer || "JOTJAGRAJ SINGH";
    const swornSigner = oathSigner(signer);

    setPdfStatus("Preparing affidavit PDF...");

    try {
      const response = await fetch(templateUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Template returned HTTP ${response.status}`);

      const pdfDoc = await PDFDocument.load(await response.arrayBuffer());
      const pdfForm = pdfDoc.getForm();

      const setText = (name: string, value: string, fontSize = name === "Work Description" ? 8 : 10) => {
        try {
          const field = pdfForm.getTextField(name);
          field.enableMultiline();
          field.setFontSize(fontSize);
          field.setText(value || "");
        } catch {}
      };

      const check = (name: string) => {
        try {
          pdfForm.getCheckBox(name).check();
        } catch {}
      };

      const clearMaterialRows = () => {
        for (let index = 1; index <= 12; index += 1) {
          setText(`M${index}`, "");
          setText(`Q${index}`, "");
        }
      };

      clearMaterialRows();
      const materials = outcome === "partial_work_completed" ? PARTIAL_MATERIALS : useWorkTemplate ? WORK_MATERIALS : ["TRASH BAG"];
      materials.forEach((material, index) => setText(`M${index + 1}`, material));
      setText("OMO", jobId);
      setText("TAX ID", "203444624");
      setText("INVOICE #", form.invoiceNo);
      setText("TRADE", "GENERAL CONSTRUCTION");
      setText("Boro", upper(form.borough));
      setText("Apt #", upper(form.location));
      setText("Building Address", upper(form.address));
      setText("BID AMOUNT", bidAmount);
      setText("INCREASE DECREASE AMOUNT", changeAmount);
      setText("TOTAL CHARGE", chargeAmount);
      setText("NAME Please Print", signer.toUpperCase());
      setText("TITLE", "VP");
      check("RC MINI NO");
      check("APPROVED INCREASE DECREASE NO");
      check("PERMIT REQUIRED NO");

      if (useWorkTemplate) {
        const workDate = form.workComplete || fieldDate;
        setText("COUNTY OF", upper(form.borough || "NEW YORK"));
        setText("being duly sworn deposes and says", `I,  ${swornSigner}/ United Angel Construction Corp`);
        setText("Apt#", upper(form.location));
        setText("State", "NY");
        setText("PARTIAL WORK DESC", "");
        setText("AMOUNT", "");
        setText("PARTIAL REFUSED AMOUNT", outcome === "partial_work_completed" ? chargeAmount : "");
        setText("relationship to building", "");
        setText("Description of individual", "");
        setText("eg malefemale", "");
        setText("MONTH", monthName(workDate));
        setText("DAY", dayOfMonth(workDate));
        setText("Type or Print Name", signer.toUpperCase());
        setText("START DATE", outcome === "work_completed" ? form.workStart || form.fieldDate : "");
        setText("COMPLETE DATE", outcome === "work_completed" ? form.workComplete || form.fieldDate : "");
        setText("Work Description", form.description || form.notes || "Work completed per HPD bid / work order.");
      } else {
        const noWorkReason = form.affidavitReason || affidavitReasonForOutcome(outcome);

        setText("inaccessibility was due to 1", outcome === "no_access" ? "NO ACCESS TO MAKE REPAIRS" : "");
        setText("inaccessibility was due to 2", "");
        setText("COUNTY OF", upper(form.borough || "NEW YORK"));
        setText("AMOUNT", chargeAmount);
        setText("ARRIVE DATE", outcome === "completed_by_others" ? secondAttempt : "");
        setText("REFUSE DATE", "");
        setText("DENIED DATE", outcome === "refused_access" ? secondAttempt : "");
        setText("DENIED DATE 1", outcome === "refused_access" ? secondAttempt : "");
        setText("DENIED TEL", "");
        setText("DENIED NAME", "");
        setText("Description of individual DENIED", "");
        setText("BUILDING RELATIONSHIP", "");
        setText("Sworn to me this", dayOfMonth(secondAttempt));
        setText("day of", monthName(secondAttempt));
        setText("Type or Print Name", signer.toUpperCase());
        setText("State", "NY");
        setText("I swear statement", `I     ${swornSigner} / United Angel Construction Corp`);
        setText("START DATE", outcome === "no_access" ? firstAttempt : "");
        setText("COMPLETE DATE", outcome === "no_access" ? secondAttempt : "");
        setText("Work Description", form.description || noWorkReason, 11);
      }

      pdfForm.updateFieldAppearances();
      pdfForm.flatten();

      const pdfPages = pdfDoc.getPages();
      const checkboxPage = pdfPages[2] || pdfPages[0];
      if (useWorkTemplate && outcome === "partial_work_completed" && checkboxPage) {
        pdfPages[0]?.drawText(form.workStart || form.fieldDate, { x: 126, y: 481, size: 10 });
        checkboxPage.drawText(invoiceDate, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(form.workStart || form.fieldDate, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(form.workComplete || form.fieldDate, { x: 423, y: 595, size: 10 });
      }
      if (!useWorkTemplate && outcome !== "no_access" && checkboxPage) {
        checkboxPage.drawText(secondAttempt, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 423, y: 595, size: 10 });
      }

      const bytes = await pdfDoc.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${safeFilename(jobId)}-${useWorkTemplate ? "work-completed" : "no-work-completed"}-affidavit.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);

      setPdfStatus("Affidavit PDF downloaded.");
    } catch (error) {
      console.error(error);
      setPdfStatus(error instanceof Error ? error.message : "Could not generate affidavit PDF.");
    }
  }

  const packageTone = outcome === "work_completed" || outcome === "partial_work_completed" ? "work" : outcome === "pending" ? "pending" : "no-work";
  const invoiceHref = `/invoice-generator?job=${encodeURIComponent(form.jobId)}&outcome=${encodeURIComponent(outcome)}`;

  return (
    <main className="hpd-paperwork-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #07111f;
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

        .hpd-paperwork-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            linear-gradient(180deg, rgba(7, 17, 31, 0.98), rgba(5, 9, 20, 1)),
            #07111f;
        }

        .paperwork-wrap {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(300px, 0.88fr) minmax(0, 1.12fr);
          gap: 14px;
        }

        .paperwork-top {
          grid-column: 1 / -1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .paperwork-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(34px, 8vw, 58px);
          line-height: 1;
          letter-spacing: 0;
        }

        .paperwork-top p,
        .paperwork-card p,
        .paperwork-field span,
        .preview-muted {
          color: #aebbd0;
        }

        .paperwork-nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .paperwork-nav a,
        .paperwork-print,
        .paperwork-secondary {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 10px 12px;
          color: #f8fbff;
          font-weight: 850;
          cursor: pointer;
        }

        .paperwork-print {
          background: #53e69c;
          color: #03120b;
          border-color: transparent;
        }

        .paperwork-card,
        .paperwork-preview {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
        }

        .paperwork-card {
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .paperwork-field {
          display: grid;
          gap: 7px;
          font-weight: 800;
          font-size: 13px;
        }

        .paperwork-field input,
        .paperwork-field select,
        .paperwork-field textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 8px;
          padding: 12px;
          font-size: 16px;
          outline: none;
        }

        .paperwork-field textarea {
          min-height: 96px;
          resize: vertical;
        }

        .paperwork-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .paperwork-package-badge {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 950;
          color: #07111f;
        }

        .paperwork-package-badge.work {
          background: #53e69c;
        }

        .paperwork-package-badge.no-work {
          background: #ffd166;
        }

        .paperwork-package-badge.pending {
          background: #cbd5e1;
        }

        .paperwork-pdf-status {
          margin: 0;
          border: 1px solid rgba(83, 230, 156, 0.28);
          background: rgba(83, 230, 156, 0.1);
          color: #caffdf;
          border-radius: 8px;
          padding: 10px;
          font-weight: 850;
        }

        .paperwork-source-status {
          margin: 0;
          border: 1px solid rgba(255, 209, 102, 0.28);
          background: rgba(255, 209, 102, 0.1);
          color: #ffe8a3;
          border-radius: 8px;
          padding: 10px;
          font-weight: 850;
        }

        .paperwork-sheet {
          background: #ffffff;
          color: #111827;
          border-radius: 8px;
          padding: 22px;
          display: grid;
          gap: 18px;
        }

        .preview-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid #d1d5db;
          padding-bottom: 14px;
        }

        .preview-head h2,
        .preview-section h3 {
          margin: 0;
          letter-spacing: 0;
        }

        .preview-head p,
        .preview-section p {
          margin: 4px 0 0;
        }

        .preview-section {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 14px;
        }

        .preview-table {
          display: grid;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .preview-row {
          display: grid;
          grid-template-columns: 1fr 170px;
        }

        .preview-row > div {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .preview-row:last-child > div {
          border-bottom: 0;
        }

        .preview-row.header {
          background: #f3f4f6;
          font-weight: 950;
        }

        .preview-total {
          margin-left: auto;
          font-size: 24px;
          font-weight: 950;
        }

        @media (max-width: 880px) {
          .paperwork-wrap {
            grid-template-columns: 1fr;
          }

          .paperwork-top {
            display: grid;
          }

          .paperwork-nav {
            justify-content: stretch;
          }

          .paperwork-nav a,
          .paperwork-nav button {
            flex: 1 1 auto;
            text-align: center;
          }
        }

        @media (max-width: 560px) {
          .paperwork-grid,
          .preview-row,
          .preview-head {
            grid-template-columns: 1fr;
            display: grid;
          }
        }

        @media print {
          .paperwork-top,
          .paperwork-card {
            display: none !important;
          }

          .hpd-paperwork-shell {
            background: #ffffff !important;
            padding: 0 !important;
          }

          .paperwork-wrap {
            display: block !important;
            max-width: none !important;
          }

          .paperwork-preview {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .paperwork-sheet {
            border-radius: 0 !important;
          }
        }
      `}</style>

      <section className="paperwork-wrap">
        <header className="paperwork-top">
          <div>
            <p>Field paperwork</p>
            <h1>Invoice + Affidavit Package</h1>
            <p>Pick work completed or no work completed, then print the package from mobile.</p>
          </div>
          <nav className="paperwork-nav" aria-label="Paperwork actions">
            <a href="/map">Map</a>
            <a href={invoiceHref}>Invoice Only</a>
            <a href={BLANK_WORK_AFFIDAVIT_TEMPLATE} download>
              Blank Work Template
            </a>
            <a href={BLANK_NO_WORK_AFFIDAVIT_TEMPLATE} download>
              Blank No-Work Template
            </a>
            <button className="paperwork-secondary" type="button" onClick={generateAffidavitPdf}>
              Download Affidavit PDF
            </button>
            <button className="paperwork-print" type="button" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </nav>
        </header>

        <section className="paperwork-card">
          <span className={`paperwork-package-badge ${packageTone}`}>{affidavitTemplateLabel(outcome)}</span>
          {form.sourceStatus ? (
            <p className="paperwork-source-status">
              Saved status: <strong>{form.sourceStatus}</strong>
            </p>
          ) : null}
          {pdfStatus ? (
            <p className="paperwork-pdf-status" aria-live="polite">
              {pdfStatus}
            </p>
          ) : null}

          <label className="paperwork-field">
            Select Job
            <select value={selectedId} onChange={(event) => chooseJob(event.target.value)}>
              <option value="">Manual package</option>
              {jobs.slice(0, 700).map((job, index) => {
                const id = getJobId(job, `JOB-${index + 1}`);
                return (
                  <option value={id} key={`${id}-${index}`}>
                    {id} - {getJobAddress(job) || getJobBorough(job) || "No address"}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="paperwork-field">
            Field Outcome
            <select value={outcome} onChange={(event) => chooseOutcome(event.target.value)}>
              {PAPERWORK_OUTCOMES.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Invoice Number
              <input value={form.invoiceNo} onChange={(event) => update("invoiceNo", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Invoice Date
              <input value={form.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} />
            </label>
          </div>

          <label className="paperwork-field">
            Job / OMO
            <input value={form.jobId} onChange={(event) => update("jobId", event.target.value)} />
          </label>

          <label className="paperwork-field">
            Address
            <input value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Location
              <input value={form.location} onChange={(event) => update("location", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Borough
              <input value={form.borough} onChange={(event) => update("borough", event.target.value)} />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Bid Amount
              <input value={form.bidAmount} onChange={(event) => update("bidAmount", event.target.value)} placeholder="$0.00" />
            </label>
            <label className="paperwork-field">
              Charge Amount
              <input value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="$0.00" />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Signer
              <input value={form.signer} onChange={(event) => update("signer", event.target.value)} placeholder="Printed name" />
            </label>
          </div>

          <label className="paperwork-field">
            Invoice Description
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Work Start
              <input value={form.workStart} onChange={(event) => update("workStart", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Work Complete / Field Date
              <input value={form.workComplete} onChange={(event) => update("workComplete", event.target.value)} />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              No Access 1st Attempt
              <input value={form.firstAttempt} onChange={(event) => update("firstAttempt", event.target.value)} />
            </label>
            <label className="paperwork-field">
              No Access 2nd / Refusal Date
              <input value={form.secondAttempt} onChange={(event) => update("secondAttempt", event.target.value)} />
            </label>
          </div>

          <label className="paperwork-field">
            Affidavit Reason
            <input value={form.affidavitReason} onChange={(event) => update("affidavitReason", event.target.value)} />
          </label>

          <label className="paperwork-field">
            Notes / Scope
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>

          <button className="paperwork-print" type="button" onClick={generateAffidavitPdf}>
            Download Filled Affidavit PDF
          </button>
        </section>

        <section className="paperwork-preview">
          <div className="paperwork-sheet">
            <div className="preview-head">
              <div>
                <h2>FIELD DOCUMENT PACKAGE</h2>
                <p className="preview-muted">{form.contractor}</p>
              </div>
              <div>
                <strong>{form.invoiceNo}</strong>
                <p className="preview-muted">{form.invoiceDate}</p>
              </div>
            </div>

            <section className="preview-section">
              <h3>{form.affidavitType}</h3>
              <p>
                <strong>OMO:</strong> {form.jobId || "Not entered"}
              </p>
              <p>
                <strong>Address:</strong> {[form.address, form.location, form.borough].filter(Boolean).join(" - ") || "Not entered"}
              </p>
              <p>
                <strong>{outcome === "work_completed" || outcome === "partial_work_completed" ? "Work status" : "No work reason"}:</strong> {form.affidavitReason}
              </p>
              {outcome === "work_completed" || outcome === "partial_work_completed" ? (
                <p>
                  <strong>Work dates:</strong> {form.workStart || "Start not entered"} to {form.workComplete || "Complete not entered"}
                </p>
              ) : (
                <p>
                  <strong>Access dates:</strong> 1st {form.firstAttempt || "not entered"} / 2nd or refusal {form.secondAttempt || "not entered"}
                </p>
              )}
              <p>
                <strong>Signer:</strong> {form.signer || "Not entered"}
              </p>
            </section>

            <section className="preview-section">
              <h3>Invoice</h3>
              <p>
                <strong>Bill To:</strong> {form.customer}
              </p>
              <div className="preview-table">
                <div className="preview-row header">
                  <div>Description</div>
                  <div>Amount</div>
                </div>
                <div className="preview-row">
                  <div>{form.description}</div>
                  <div>
                    <strong>{form.amount || "$0.00"}</strong>
                  </div>
                </div>
              </div>
              <div className="preview-total">Total: {form.amount || "$0.00"}</div>
            </section>

            <section className="preview-section">
              <h3>Notes</h3>
              <p>{form.notes || "No notes entered."}</p>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
