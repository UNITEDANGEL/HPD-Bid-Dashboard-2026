import { jsonFromWorker } from "../../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  return jsonFromWorker(`/runs/${encodeURIComponent(runId)}`);
}
