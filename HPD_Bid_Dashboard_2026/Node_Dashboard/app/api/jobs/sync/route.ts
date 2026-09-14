import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  fetcherRootCandidates,
  getJobs,
  getJobsCoverageInfo,
  getJobsSourceInfo,
  parseJobsFromCsv,
  parseJobsFromJson,
} from "../../../../lib/jobs";

type FeedType = "csv" | "json";

export const runtime = "nodejs";

const ALLOWED_FEED_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
];
const ALLOWED_FEED_SUFFIXES = [
  ".googleusercontent.com",
  ".googleapis.com",
  ".storage.googleapis.com",
  ".pages.dev",
  ".chatgpt.site",
];

function allowedFeedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_FEED_HOSTS.includes(host) || ALLOWED_FEED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function inferFeedType(url: URL, requestedType?: string): FeedType {
  if (requestedType === "json") return "json";
  if (requestedType === "csv") return "csv";
  return url.pathname.toLowerCase().endsWith(".json") ? "json" : "csv";
}

function normalizedFeedUrl(rawUrl: string, requestedType?: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const url = new URL(trimmed);
  if (url.protocol !== "https:") {
    throw new Error("Live feed must be an HTTPS link.");
  }
  if (!allowedFeedHost(url.hostname)) {
    throw new Error("Feed host is not allowed. Use Google Drive, Google Sheets, GitHub, Pages, or the published app API.");
  }

  const type = inferFeedType(url, requestedType);
  if (url.hostname === "docs.google.com" && url.pathname.includes("/spreadsheets/d/") && type === "csv") {
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    const gid = url.searchParams.get("gid") || url.hash.match(/gid=([^&]+)/)?.[1] || "0";
    if (match?.[1] && !url.searchParams.get("output")) {
      return {
        url: `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`,
        type,
        manual: true,
      };
    }
  }

  if (url.hostname === "drive.google.com" && url.pathname.includes("/file/d/")) {
    const match = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (match?.[1]) {
      return {
        url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}`,
        type,
        manual: true,
      };
    }
  }

  return { url: url.toString(), type, manual: true };
}

function feedConfig(feedUrl = "", feedType?: string) {
  const manualFeed = normalizedFeedUrl(feedUrl, feedType);
  if (manualFeed) return manualFeed;

  const jsonUrl = String(process.env.JOBS_JSON_URL || "").trim();
  if (jsonUrl) return { url: jsonUrl, type: "json" as const, manual: false };

  const csvUrl = String(process.env.JOBS_CSV_URL || "").trim();
  if (csvUrl) return { url: csvUrl, type: "csv" as const, manual: false };

  return null;
}

function isSameAppJobsFeed(request: Request, feedUrl: string) {
  try {
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(feedUrl);
    return targetUrl.origin === requestUrl.origin && targetUrl.pathname === "/api/jobs";
  } catch {
    return false;
  }
}

function newestExistingPath(candidates: string[]) {
  return candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({ candidate, updatedAt: fs.statSync(candidate).mtimeMs }))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.candidate;
}

function readFetcherRunInfo() {
  const root = process.cwd();
  const candidates = [
    ...fetcherRootCandidates().flatMap((candidateRoot) => [
      path.resolve(candidateRoot, "data", "fetcher_latest_status.json"),
      path.resolve(candidateRoot, "public", "data", "fetcher_latest_status.json"),
    ]),
    path.resolve(root, "data", "fetcher_latest_status.json"),
    path.resolve(root, "public", "data", "fetcher_latest_status.json"),
  ];
  const latestStatusPath = newestExistingPath(candidates);

  if (latestStatusPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(latestStatusPath, "utf-8")) as Record<string, unknown>;
      const logPath = newestExistingPath([
        path.resolve(path.dirname(latestStatusPath), "fetcher_latest_run.log"),
        ...fetcherRootCandidates().flatMap((candidateRoot) => [
          path.resolve(candidateRoot, "data", "fetcher_latest_run.log"),
          path.resolve(candidateRoot, "public", "data", "fetcher_latest_run.log"),
        ]),
        path.resolve(root, "data", "fetcher_latest_run.log"),
        path.resolve(root, "public", "data", "fetcher_latest_run.log"),
      ]) || path.resolve(path.dirname(latestStatusPath), "fetcher_latest_run.log");
      const logTail = fs.existsSync(logPath)
        ? fs.readFileSync(logPath, "utf-8").split(/\r?\n/).slice(-80).join("\n")
        : "";
      const authError = /invalid_grant|expired|revoked/i.test(logTail)
        ? "Google token expired or revoked. Reconnect Google auth before running the Gmail fetcher."
        : "";

      return {
        fetcherState: String(parsed.state || ""),
        fetcherOk: Boolean(parsed.ok),
        fetcherStartedAt: String(parsed.startedAt || ""),
        fetcherFinishedAt: String(parsed.finishedAt || ""),
        fetcherError: authError || String(parsed.error || ""),
        fetcherLogPath: logPath,
      };
    } catch {
      return {
        fetcherState: "status_parse_error",
        fetcherOk: false,
        fetcherStartedAt: "",
        fetcherFinishedAt: "",
        fetcherError: "Could not parse fetcher_latest_status.json",
        fetcherLogPath: "",
      };
    }
  }

  return {
    fetcherState: "",
    fetcherOk: false,
    fetcherStartedAt: "",
    fetcherFinishedAt: "",
    fetcherError: "",
    fetcherLogPath: "",
  };
}

function localFetcherRoot() {
  return fetcherRootCandidates().find((candidate) => (
    fs.existsSync(path.resolve(candidate, "scripts", "run-safe-fetcher-update.js")) &&
    fs.existsSync(path.resolve(candidate, "FetchrMatcherV5.py"))
  ));
}

function runLocalGmailFetcher() {
  const fetcherRoot = localFetcherRoot();
  if (!fetcherRoot) {
    throw new Error("Local Gmail fetcher is not installed for this dashboard.");
  }

  const result = spawnSync(process.execPath, ["scripts/run-safe-fetcher-update.js"], {
    cwd: fetcherRoot,
    shell: false,
    encoding: "utf-8",
    timeout: 10 * 60 * 1000,
    env: {
      ...process.env,
      FETCHER_LOOKBACK_DAYS: process.env.FETCHER_LOOKBACK_DAYS || "30",
      HPD_DASHBOARD_DATA_DIR: path.resolve(process.cwd(), "data"),
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
  });

  if (result.error) {
    throw new Error(`Local Gmail fetch failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const output = `${result.stderr || ""}\n${result.stdout || ""}`.trim().split(/\r?\n/).slice(-8).join(" ");
    throw new Error(output || `Local Gmail fetch failed with exit code ${result.status}.`);
  }
}

function sourceLabel(type: "csv" | "json", sourcePath: string) {
  return sourcePath.toLowerCase().includes(".automation-hpd") ? `Fetcher ${type.toUpperCase()}` : `Bundled ${type.toUpperCase()}`;
}

function dateKeyFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBehindDateKey(value: string) {
  const date = startOfDateKey(value);
  if (!date) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((todayStart.getTime() - date.getTime()) / 86400000));
}

function coverageWithFetcherRun(coverage: ReturnType<typeof getJobsCoverageInfo>, fetcher: ReturnType<typeof readFetcherRunInfo>) {
  const fetchThroughDate = fetcher.fetcherOk ? dateKeyFromIso(fetcher.fetcherFinishedAt) : "";
  const fetchDaysBehind = fetchThroughDate ? daysBehindDateKey(fetchThroughDate) : null;

  return {
    ...coverage,
    inferredDataThroughDate: coverage.dataThroughDate,
    fetchThroughDate,
    dataThroughDate: fetchThroughDate || coverage.dataThroughDate,
    daysBehind: fetchDaysBehind ?? coverage.daysBehind,
  };
}

function localSourcePayload() {
  const source = getJobsSourceInfo();
  const jobs = getJobs();
  const configured = Boolean(feedConfig());
  const coverage = getJobsCoverageInfo(jobs);
  const fetcher = readFetcherRunInfo();
  const effectiveCoverage = coverageWithFetcherRun(coverage, fetcher);
  const fetcherAuthError = /invalid_grant|expired|revoked|auth/i.test(fetcher.fetcherError);

  return {
    configured,
    count: jobs.length,
    lastSyncAt: source.updatedAt,
    sourceUpdatedAt: source.updatedAt,
    source: sourceLabel(source.type, source.path),
    ...effectiveCoverage,
    ...fetcher,
    jobs,
    message: fetcherAuthError
      ? "Gmail fetch needs Google re-auth before jobs can be updated through today."
      : fetcher.fetcherOk
      ? "Gmail fetch completed. Latest fetched jobs are loaded from this machine."
      : configured
      ? "Live feed is configured. Tap Fetch Now to pull the latest file."
      : "Live feed URL is not connected yet. Connect JOBS_CSV_URL or JOBS_JSON_URL to enable live award fetch.",
  };
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      ...localSourcePayload(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: Boolean(feedConfig()),
        error: error instanceof Error ? error.message : "Unable to read fetch status",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { feedUrl?: unknown; feedType?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let feed: ReturnType<typeof feedConfig>;
  try {
    feed = feedConfig(String(body.feedUrl || ""), String(body.feedType || ""));
  } catch (error) {
    const fallback = localSourcePayload();
    return NextResponse.json(
      {
        ok: false,
        ...fallback,
        configured: true,
        message: "Feed setup needs attention.",
        error: error instanceof Error ? error.message : "Feed URL is invalid.",
      },
      { status: 400 },
    );
  }

  if (!feed) {
    try {
      runLocalGmailFetcher();
      return NextResponse.json({
        ok: true,
        ...localSourcePayload(),
        message: "Gmail fetch completed. Latest fetched jobs are loaded permanently on this machine.",
      });
    } catch (error) {
      const fallback = localSourcePayload();
      return NextResponse.json(
        {
          ok: false,
          ...fallback,
          message: "Local Gmail fetch needs attention.",
          error: error instanceof Error ? error.message : "Local Gmail fetch failed.",
        },
        { status: 502 },
      );
    }
  }

  try {
    if (feed.manual && isSameAppJobsFeed(request, feed.url)) {
      const fallback = localSourcePayload();
      const now = new Date().toISOString();
      return NextResponse.json({
        ok: true,
        configured: true,
        count: fallback.count,
        jobs: fallback.jobs,
        lastSyncAt: now,
        sourceUpdatedAt: fallback.sourceUpdatedAt,
        ...coverageWithFetcherRun(getJobsCoverageInfo(fallback.jobs), readFetcherRunInfo()),
        source: "Manual JSON",
        message: `${fallback.count} jobs loaded from this app's API feed.`,
      });
    }

    const response = await fetch(feed.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Live ${feed.type.toUpperCase()} returned ${response.status}`);
    }

    const sourceText = await response.text();
    const jobs = feed.type === "json" ? parseJobsFromJson(sourceText) : parseJobsFromCsv(sourceText);
    const now = new Date().toISOString();
    const source = `${feed.manual ? "Manual" : "Live"} ${feed.type.toUpperCase()}`;

    return NextResponse.json({
      ok: true,
      configured: true,
      count: jobs.length,
      jobs,
      lastSyncAt: now,
      sourceUpdatedAt: now,
      ...getJobsCoverageInfo(jobs),
      ...readFetcherRunInfo(),
      source,
      message: `${jobs.length} jobs fetched from the ${feed.manual ? "pasted" : "live"} feed.`,
    });
  } catch (error) {
    const fallback = localSourcePayload();
    return NextResponse.json(
      {
        ok: false,
        ...fallback,
        error: error instanceof Error ? error.message : "Live fetch failed",
      },
      { status: 502 },
    );
  }
}
