import { NextResponse } from "next/server";
import { getJobs, getJobsSourceInfo, parseJobsFromCsv } from "../../../../lib/jobs";

function feedUrl() {
  return String(process.env.JOBS_CSV_URL || "").trim();
}

function localSourcePayload() {
  const source = getJobsSourceInfo();
  const jobs = getJobs();

  return {
    configured: Boolean(feedUrl()),
    count: jobs.length,
    lastSyncAt: source.updatedAt,
    source: "Bundled CSV",
    message: feedUrl()
      ? "Live CSV feed is configured. Tap Fetch Now to pull the latest file."
      : "Live CSV feed is not configured yet. Showing the last bundled dashboard CSV.",
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
        configured: Boolean(feedUrl()),
        error: error instanceof Error ? error.message : "Unable to read fetch status",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  const url = feedUrl();
  if (!url) {
    const fallback = localSourcePayload();
    return NextResponse.json(
      {
        ok: false,
        ...fallback,
        error: "Live CSV feed is not configured. Add JOBS_CSV_URL in Sites to fetch new COA data automatically.",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Live CSV returned ${response.status}`);
    }

    const csvText = await response.text();
    const jobs = parseJobsFromCsv(csvText);
    const now = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      configured: true,
      count: jobs.length,
      jobs,
      lastSyncAt: now,
      source: "Live CSV",
      message: `${jobs.length} 2026+ jobs fetched from the live CSV feed.`,
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
