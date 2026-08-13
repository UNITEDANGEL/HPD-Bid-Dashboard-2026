import { NextResponse } from "next/server";
import { getJobs, getJobsSourceInfo, parseJobsFromCsv, parseJobsFromJson } from "../../../../lib/jobs";

type FeedType = "csv" | "json";

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

function localSourcePayload() {
  const source = getJobsSourceInfo();
  const jobs = getJobs();
  const configured = Boolean(feedConfig());

  return {
    configured,
    count: jobs.length,
    lastSyncAt: source.updatedAt,
    source: `Bundled ${source.type.toUpperCase()}`,
    jobs,
    message: configured
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
    return NextResponse.json({
      ok: true,
      ...localSourcePayload(),
    });
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
