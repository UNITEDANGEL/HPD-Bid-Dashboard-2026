export const jobStatusSchema = `
CREATE TABLE IF NOT EXISTS job_statuses (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`;

export const jobStatusHistorySchema = `
CREATE TABLE IF NOT EXISTS job_status_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`;

export const jobMediaSchema = `
CREATE TABLE IF NOT EXISTS job_media (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL
)
`;
