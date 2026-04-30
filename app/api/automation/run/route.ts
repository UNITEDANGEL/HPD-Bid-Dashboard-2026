import { jsonFromWorker } from "../../../../lib/automation/worker";

export async function POST(request: Request) {
  const body = await request.text();

  return jsonFromWorker("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
