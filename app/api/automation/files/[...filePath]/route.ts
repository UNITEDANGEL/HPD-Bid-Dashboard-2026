import { proxyFileFromWorker } from "../../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filePath: string[] }> },
) {
  const { filePath } = await context.params;
  const safePath = filePath.map((segment) => encodeURIComponent(segment)).join("/");
  return proxyFileFromWorker(`/files/${safePath}`);
}
