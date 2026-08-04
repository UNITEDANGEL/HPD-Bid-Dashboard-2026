import { NextResponse } from "next/server";
import { getJobs, getJobsSourceInfo, parseJobsFromCsv, parseJobsFromJson } from "../../../../lib/jobs";

function feedConfig() {
  const jsonUrl = String(process.env.JOBS_JSON_URL || "").trim();
  if (jsonUrl) return { url: jsonUrl, type: "json" as const };

  const csvUrl = String(process.env.JOBS_CSV_URL || "").trim();
  if (csvUrl) return { url: csvUrl, type: "csv" as const };

  return null;
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
      : "Reloaded the latest bundled 2026 scheduled data. Live feed URL is not connected yet.",
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

export async function POST() {
  const feed = feedConfig();
  if (!feed) {
    return NextResponse.json({
      ok: true,
      ...localSourcePayload(),
    });
  }

  try {
    const response = await fetch(feed.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Live ${feed.type.toUpperCase()} returned ${response.status}`);
    }

    const sourceText = await response.text();
    const jobs = feed.type === "json" ? parseJobsFromJson(sourceText) : parseJobsFromCsv(sourceText);
    const now = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      configured: true,
      count: jobs.length,
      jobs,
      lastSyncAt: now,
      source: `Live ${feed.type.toUpperCase()}`,
      message: `${jobs.length} 2026+ jobs fetched from the live feed.`,
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
