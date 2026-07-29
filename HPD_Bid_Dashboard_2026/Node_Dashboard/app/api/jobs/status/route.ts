import { NextResponse } from "next/server";
import { archiveCompleted, upsertOverride } from "../../../../lib/job-overrides";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const updated = upsertOverride({
      id: body.id,
      status: body.status,
      archived: body.archived,
    });

    return NextResponse.json({ ok: true, override: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update job status";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const updated = archiveCompleted(ids);

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to archive completed jobs";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
