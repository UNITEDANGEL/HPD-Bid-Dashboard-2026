import { NextRequest } from "next/server";
import { jsonFromWorker } from "../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return jsonFromWorker(`/runs${request.nextUrl.search}`);
}

