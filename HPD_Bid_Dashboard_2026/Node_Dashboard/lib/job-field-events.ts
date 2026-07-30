import fs from "fs";
import path from "path";
import Papa from "papaparse";

export type JobStatusEvent = {
  RowID: string;
  Status: string;
  UpdatedAt: string;
};

const STATUS_HISTORY_HEADERS = ["RowID", "Status", "UpdatedAt"] as const;

function historyPath() {
  return path.resolve(process.cwd(), "data", "status_history_2026.csv");
}

function normalizeId(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function readStatusHistory(id?: string) {
  const filePath = historyPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const target = normalizeId(id || "");
  const parsed = Papa.parse(fs.readFileSync(filePath, "utf-8"), {
    header: true,
    skipEmptyLines: true,
  });

  return ((parsed.data || []) as Partial<JobStatusEvent>[])
    .map((row) => ({
      RowID: String(row.RowID || ""),
      Status: String(row.Status || ""),
      UpdatedAt: String(row.UpdatedAt || ""),
    }))
    .filter((row) => row.RowID && row.Status && (!target || normalizeId(row.RowID) === target))
    .sort((a, b) => b.UpdatedAt.localeCompare(a.UpdatedAt));
}

export function appendStatusHistory(id: string, status: string) {
  const rowId = String(id || "").trim();
  const nextStatus = String(status || "").trim();
  if (!rowId || !nextStatus) {
    throw new Error("Missing job status event");
  }

  const rows = readStatusHistory();
  const next = [
    {
      RowID: rowId,
      Status: nextStatus,
      UpdatedAt: new Date().toISOString(),
    },
    ...rows,
  ];

  const filePath = historyPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${Papa.unparse(next, { columns: [...STATUS_HISTORY_HEADERS] })}\n`, "utf-8");
  return next[0];
}
