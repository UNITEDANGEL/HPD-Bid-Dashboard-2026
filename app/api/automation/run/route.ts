import { NextRequest } from "next/server";
import { jsonFromWorker } from "../../../../lib/automation/worker";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return jsonFromWorker("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}

