import { appointmentCalendar } from "../../lib/appointments.ts";

// GET /api/appointment-calendar?id=&address=&date=&start=&end=&state=&contact=&phone=&note=&reminder=
// Answers with the appointment as a calendar entry, so the iPhone shows "Add to Calendar" and the
// Calendar alerts before the visit, even when the app is closed. Nothing is stored.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const get = (name) => (url.searchParams.get(name) || "").slice(0, 500);
  const id = get("id").replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 40);
  const appointment = {
    date: get("date"),
    start: get("start"),
    end: get("end"),
    state: get("state") || "requested",
    contact: get("contact") || "Tenant",
    phone: get("phone"),
    note: get("note"),
    reminder: Number(get("reminder") || 60),
  };
  try {
    if (!id) throw new Error("Missing job number.");
    const link = `${url.origin}/map/?job=${encodeURIComponent(id)}`;
    const body = appointmentCalendar(id, get("address"), appointment, link);
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="HPD-${id.replace(/\s+/g, "-")}-appointment.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(`Could not make the calendar entry: ${error instanceof Error ? error.message : "check the appointment"}`, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
