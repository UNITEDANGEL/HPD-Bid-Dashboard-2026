"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JobRecord } from "../lib/types";

type Props = {
  job: JobRecord;
};

type MediaFile = {
  id?: string;
  name: string;
  type?: string;
  size?: number;
  createdAt?: string;
  url: string;
};

type StatusHistoryEvent = {
  RowID?: string;
  Status: string;
  UpdatedAt: string;
};

const FIELD_STATUS_ACTIONS = [
  { label: "Arrived", value: "Arrived" },
  { label: "Started", value: "Started" },
  { label: "Progress", value: "Work In Progress" },
  { label: "Complete", value: "Work Completed" },
  { label: "No Access", value: "No Access - 1st Attempt" },
] as const;

function formatFileSize(value = 0) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isImage(file: MediaFile) {
  const type = String(file.type || "").toLowerCase();
  const source = `${file.name || ""} ${file.url || ""}`;
  return type.startsWith("image/") || type === "image" || /\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(source);
}

export function JobMediaPackage({ job }: Props) {
  const [status, setStatus] = useState(job.status || "Open");
  const [history, setHistory] = useState<StatusHistoryEvent[]>([]);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  const sourceFiles = useMemo(() => [
    job.coaFile ? { label: "COA", name: job.coaFile } : null,
    job.itbFile ? { label: "ITB", name: job.itbFile } : null,
  ].filter((item): item is { label: string; name: string } => Boolean(item)), [job.coaFile, job.itbFile]);

  useEffect(() => {
    let active = true;

    async function loadPackage() {
      try {
        const [statusResponse, mediaResponse] = await Promise.all([
          fetch(`/api/jobs/status?id=${encodeURIComponent(job.id)}`),
          fetch(`/api/jobs/media?jobId=${encodeURIComponent(job.id)}`),
        ]);

        if (statusResponse.ok) {
          const statusData = await statusResponse.json() as {
            ok?: boolean;
            statuses?: Record<string, string>;
            history?: StatusHistoryEvent[];
          };
          if (active && statusData.ok) {
            const savedStatus = statusData.statuses?.[job.id];
            if (savedStatus) setStatus(savedStatus);
            setHistory(statusData.history || []);
          }
        }

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json() as { ok?: boolean; files?: MediaFile[] };
          if (active && mediaData.ok) {
            setFiles(mediaData.files || []);
          }
        }
      } catch {
        if (active) setMessage("Package sync is temporarily unavailable.");
      }
    }

    void loadPackage();
    return () => {
      active = false;
    };
  }, [job.id]);

  async function updateStatus(nextStatus: string) {
    setStatus(nextStatus);
    setIsSavingStatus(true);
    setMessage("");

    try {
      const response = await fetch("/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, status: nextStatus }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; status?: string; history?: StatusHistoryEvent[] };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save status");
      setStatus(data.status || nextStatus);
      setHistory(data.history || []);
      setMessage(`${job.id} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save status.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    if (!selectedFiles.length) return;

    const formData = new FormData();
    formData.append("jobId", job.id);
    selectedFiles.forEach((file) => formData.append("files", file));

    setIsUploading(true);
    setMessage("");
    try {
      const response = await fetch("/api/jobs/media", {
        method: "POST",
        body: formData,
      });
      const data = await response.json() as { ok?: boolean; error?: string; files?: MediaFile[] };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to upload files");
      setFiles((current) => [...(data.files || []), ...current]);
      setMessage(`${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload files.");
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  }

  return (
    <section className="job-package-card">
      <div className="job-package-head">
        <div>
          <p className="eyebrow">Field Package</p>
          <h3>Status, photos, and documents</h3>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="package-status-actions" aria-label="Update job status">
        {FIELD_STATUS_ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            className={status.toLowerCase() === action.value.toLowerCase() ? "is-active" : ""}
            disabled={isSavingStatus}
            onClick={() => updateStatus(action.value)}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="package-upload-row">
        <label className={isUploading ? "is-disabled" : ""}>
          {isUploading ? "Saving files" : "Add photos or documents"}
          <input
            className="sr-only-file"
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
            disabled={isUploading}
            onChange={uploadFiles}
          />
        </label>
        {message ? <span>{message}</span> : null}
      </div>

      <div className="package-columns">
        <div className="package-panel">
          <h4>Field History</h4>
          {history.length ? (
            <ul className="package-history-list">
              {history.slice(0, 8).map((event, index) => (
                <li key={`${event.UpdatedAt}-${index}`}>
                  <strong>{event.Status}</strong>
                  <span>{formatEventTime(event.UpdatedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No field status history saved yet.</p>
          )}
        </div>

        <div className="package-panel">
          <h4>Source Files</h4>
          {sourceFiles.length ? (
            <ul className="source-file-list">
              {sourceFiles.map((file) => (
                <li key={`${file.label}-${file.name}`}>
                  <strong>{file.label}</strong>
                  <span>{file.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No matched COA or ITB files in the source data.</p>
          )}
        </div>
      </div>

      <div className="package-media-grid">
        {files.length ? files.map((file) => (
          <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer" className="package-media-tile">
            {isImage(file) ? <img src={file.url} alt={file.name} /> : <span className="package-file-icon" aria-hidden="true" />}
            <strong>{file.name}</strong>
            <small>{[file.type, formatFileSize(file.size)].filter(Boolean).join(" | ")}</small>
          </a>
        )) : (
          <p className="package-empty">No uploaded field media yet.</p>
        )}
      </div>
    </section>
  );
}
