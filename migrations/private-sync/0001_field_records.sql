-- Apply only to the dedicated private D1 database after Access is configured.
-- This migration does not read or modify the public fetched-job dataset.
CREATE TABLE IF NOT EXISTS field_records (
  owner_email TEXT NOT NULL,
  job_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, job_id)
);

CREATE TABLE IF NOT EXISTS field_events (
  owner_email TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, operation_id),
  UNIQUE (owner_email, job_id, revision),
  FOREIGN KEY (owner_email, job_id) REFERENCES field_records(owner_email, job_id)
);

CREATE TABLE IF NOT EXISTS field_files (
  owner_email TEXT NOT NULL,
  file_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('before', 'after', 'affidavit', 'invoice', 'package', 'other')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, file_id),
  FOREIGN KEY (owner_email, job_id) REFERENCES field_records(owner_email, job_id)
);

CREATE INDEX IF NOT EXISTS field_events_job ON field_events(owner_email, job_id, revision);
CREATE INDEX IF NOT EXISTS field_files_job ON field_files(owner_email, job_id);
