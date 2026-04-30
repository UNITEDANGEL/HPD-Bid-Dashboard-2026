import { jsonFromWorker } from "../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "10";

  return jsonFromWorker(`/runs?limit=${encodeURIComponent(limit)}`);
}
