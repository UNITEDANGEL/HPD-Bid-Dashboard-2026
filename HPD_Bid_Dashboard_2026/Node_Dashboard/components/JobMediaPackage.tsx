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

type FieldNote = {
  id: string;
  text: string;
  status: string;
  createdAt: string;
};

const STATUS_OVERRIDE_STORAGE_KEY = "hpd-job-status-overrides-v1";
const FIELD_NOTE_STORAGE_KEY = "hpd-job-field-notes-v1";

const FIELD_STATUS_ACTIONS = [
  { label: "Arrived", value: "Arrived On Site" },
  { label: "Started", value: "Work Started" },
  { label: "Progress", value: "Work In Progress" },
  { label: "Complete", value: "Work Completed" },
  { label: "No Access", value: "No Access - 1st Attempt" },
  { label: "Refused", value: "Refused Access" },
  { label: "Materials", value: "Needs Materials" },
  { label: "Follow Up", value: "Follow Up Required" },
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

function sourceStatusForJob(job: JobRecord) {
  const rawStatus = String(job.raw?.Status || job.raw?.status || job.raw?.["Job Status"] || job.raw?.state || "").trim();
  return rawStatus || (job.awardDate ? "Awarded" : "Open");
}

function readLocalStatusMap() {
  try {
    const stored = window.localStorage.getItem(STATUS_OVERRIDE_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeLocalStatus(jobId: string, nextStatus: string) {
  try {
    window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify({ ...readLocalStatusMap(), [jobId]: nextStatus }));
    return true;
  } catch {
    return false;
  }
}

function clearLocalStatus(jobId: string) {
  try {
    const statuses = readLocalStatusMap();
    delete statuses[jobId];
    window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(statuses));
    return true;
  } catch {
    return false;
  }
}

function readLocalNoteMap() {
  try {
    const stored = window.localStorage.getItem(FIELD_NOTE_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, FieldNote[]> : {};
  } catch {
    return {};
  }
}

function writeLocalNotes(jobId: string, notes: FieldNote[]) {
  try {
    const allNotes = readLocalNoteMap();
    allNotes[jobId] = notes;
    window.localStorage.setItem(FIELD_NOTE_STORAGE_KEY, JSON.stringify(allNotes));
    return true;
  } catch {
    return false;
  }
}

function clearLocalNotes(jobId: string) {
  try {
    const allNotes = readLocalNoteMap();
    delete allNotes[jobId];
    window.localStorage.setItem(FIELD_NOTE_STORAGE_KEY, JSON.stringify(allNotes));
    return true;
  } catch {
    return false;
  }
}

export function JobMediaPackage({ job }: Props) {
  const originalStatus = useMemo(() => sourceStatusForJob(job), [job]);
  const [status, setStatus] = useState(job.status || originalStatus);
  const [hasLocalStatus, setHasLocalStatus] = useState(false);
  const [history, setHistory] = useState<StatusHistoryEvent[]>([]);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  const sourceFiles = useMemo(() => [
    job.coaFile ? { label: "COA", name: job.coaFile } : null,
    job.itbFile ? { label: "ITB", name: job.itbFile } : null,
  ].filter((item): item is { label: string; name: string } => Boolean(item)), [job.coaFile, job.itbFile]);

  useEffect(() => {
    let active = true;

    async function fetchStatusPackage() {
      let response: Response | null = null;
      try {
        response = await fetch(`/api/jobs/status?id=${encodeURIComponent(job.id)}`);
      } catch {
        response = null;
      }
      return response?.ok ? response : fetch("/api/jobs/status");
    }

    async function loadPackage() {
      try {
        let localStatus = "";
        try {
          const urlStatus = new URLSearchParams(window.location.search).get("status") || "";
          if (urlStatus) {
            localStatus = urlStatus;
            setStatus(urlStatus);
            setHasLocalStatus(true);
            writeLocalStatus(job.id, urlStatus);
          }
        } catch {
          // The URL handoff is only a convenience; the page can still load without it.
        }

        try {
          if (!localStatus) {
            const storedStatus = readLocalStatusMap()[job.id] || "";
            if (storedStatus) {
              localStatus = storedStatus;
              setStatus(storedStatus);
              setHasLocalStatus(true);
            }
          }
        } catch {
          // The package still works if browser storage is unavailable.
        }

        try {
          setNotes(readLocalNoteMap()[job.id] || []);
        } catch {
          setNotes([]);
        }

        const [statusResponse, mediaResponse] = await Promise.all([
          fetchStatusPackage(),
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
            if (savedStatus && !localStatus) {
              setStatus(savedStatus);
              setHasLocalStatus(false);
            }
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
    setHasLocalStatus(true);
    writeLocalStatus(job.id, nextStatus);
    setHistory((current) => [
      { RowID: job.id, Status: nextStatus, UpdatedAt: new Date().toISOString() },
      ...current,
    ]);
    setIsSavingStatus(true);
    setMessage("Saved locally on this device.");

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
      setMessage(`${job.id} saved locally and synced.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Saved locally. Shared sync: ${error.message}` : "Saved locally on this device.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function clearSavedStatus() {
    clearLocalStatus(job.id);
    setStatus(originalStatus);
    setHasLocalStatus(false);
    setIsSavingStatus(true);
    setMessage("Local status cleared.");

    try {
      const response = await fetch(`/api/jobs/status?id=${encodeURIComponent(job.id)}`, {
        method: "DELETE",
      });
      const data = await response.json() as { ok?: boolean; error?: string; history?: StatusHistoryEvent[] };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to clear shared status");
      setHistory(data.history || []);
      setMessage(`${job.id} status cleared.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Local clear done. Shared clear: ${error.message}` : "Local status cleared.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  function saveNote() {
    const text = noteDraft.trim();
    if (!text) {
      setMessage("Write a note before saving.");
      return;
    }

    const nextNotes = [
      {
        id: `${job.id}-${Date.now()}`,
        text,
        status,
        createdAt: new Date().toISOString(),
      },
      ...notes,
    ].slice(0, 50);

    setNotes(nextNotes);
    setNoteDraft("");
    setMessage(writeLocalNotes(job.id, nextNotes) ? "Note saved on this device." : "Note kept on screen. Browser storage is unavailable.");
  }

  function clearNotes() {
    clearLocalNotes(job.id);
    setNotes([]);
    setNoteDraft("");
    setMessage("Local notes cleared.");
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
            aria-pressed={status.toLowerCase() === action.value.toLowerCase()}
            title={action.value}
            disabled={isSavingStatus}
            onClick={() => updateStatus(action.value)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="package-clear-status"
          disabled={isSavingStatus}
          onClick={clearSavedStatus}
        >
          Clear
        </button>
      </div>

      <div className="package-local-state">
        <strong>{hasLocalStatus ? "Saved on this device" : "Using source status"}</strong>
        <span>{hasLocalStatus ? "This status stays here until you clear it." : "Pick a field status to save it locally."}</span>
      </div>

      <div className="package-note-box">
        <label htmlFor="field-note">Field notes</label>
        <textarea
          id="field-note"
          value={noteDraft}
          rows={3}
          placeholder="Add access, tenant, materials, or next-step notes..."
          onChange={(event) => setNoteDraft(event.target.value)}
        />
        <div className="package-note-actions">
          <button type="button" onClick={saveNote}>Save Note</button>
          <button type="button" className="package-clear-status" onClick={clearNotes} disabled={!notes.length && !noteDraft.trim()}>
            Clear Notes
          </button>
        </div>
        {notes.length ? (
          <ul className="package-notes-list">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id}>
                <p>{note.text}</p>
                <span>{formatEventTime(note.createdAt)} · {note.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="package-notes-empty">No local notes saved for this job.</p>
        )}
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
