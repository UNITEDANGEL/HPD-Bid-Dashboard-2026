import { NextResponse } from "next/server";
import { appendStatusHistory, readStatusHistory } from "../../../../lib/job-field-events";
import { archiveCompleted, readOverrides, upsertOverride } from "../../../../lib/job-overrides";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  const overrides = readOverrides();
  const statuses = Object.fromEntries(
    overrides
      .filter((row) => row.OMO && row.StatusOverride)
      .map((row) => [row.OMO, row.StatusOverride]),
  );

  return NextResponse.json({
    ok: true,
    statuses,
    history: id ? readStatusHistory(id) : [],
  });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const updated = upsertOverride({
      id: body.id,
      status: body.status,
      archived: body.archived,
    });
    const event = body.status ? appendStatusHistory(body.id, body.status) : null;

    return NextResponse.json({
      ok: true,
      override: updated,
      status: updated.StatusOverride || updated.FieldOutcome,
      history: event ? readStatusHistory(body.id) : [],
    });
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
