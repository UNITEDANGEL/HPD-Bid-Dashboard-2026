export type AutomationFile = {
  name: string;
  relativePath: string;
  sizeBytes?: number;
  createdAt?: string;
  kind?: "input" | "output" | "log" | "other";
};

export type AutomationCounts = {
  fetched: number;
  processed: number;
  filled: number;
  skipped: number;
  failed: number;
};

export type AutomationRun = {
  runId: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  query: string;
  days: number;
  maxResults: number;
  counts: AutomationCounts;
  files: AutomationFile[];
  logs: string[];
  error?: string;
};
