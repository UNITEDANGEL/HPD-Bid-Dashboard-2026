import { NextResponse } from "next/server";
import { getJobs } from "../../../lib/jobs";

export async function GET() {
  try {
    const jobs = getJobs();

    return NextResponse.json({
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load real job data",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
