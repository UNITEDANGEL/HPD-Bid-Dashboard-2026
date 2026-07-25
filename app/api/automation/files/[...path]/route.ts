import { proxyFileFromWorker } from "../../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const filePath = (params.path ?? []).map(encodeURIComponent).join("/");

  return proxyFileFromWorker(`/files/${filePath}`);
}

