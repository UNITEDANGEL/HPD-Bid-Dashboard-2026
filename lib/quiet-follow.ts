// 📸 Missing photos in the brief, 🌆 tomorrow's route at 6 PM, 📱 tenants who went quiet (plan items 36-38).
// Plain logic only: the app passes in what it knows. No tenant names or phones leave the phone.

type Job = Record<string, unknown>;

const many = (ids: string[]) => ids.length > 1 ? `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}` : ids[0] || "";

// 1. "Photos: 2 finished jobs have no after photos yet: ER1 and ER2. HPD rejects the paperwork without them."
export function photoGapLine(ids: string[]) {
  if (!ids.length) return "";
  const shown = ids.slice(0, 4);
  return `Photos: ${ids.length} finished job${ids.length === 1 ? " has" : "s have"} no after photos yet: ${many(shown)}${ids.length > 4 ? `, and ${ids.length - 4} more` : ""}. HPD rejects the paperwork without them.`;
}

// 2. Once, from 6 PM to 10 PM New York: tomorrow's stops in order, the first one first.
export const isRouteTime = (hour: number) => hour >= 18 && hour < 22;
export function tomorrowRouteLine(stops: { address: string; text?: string }[], firstDrive = "") {
  if (!stops.length) return "";
  const list = stops.slice(0, 4).map((s, i) => `${i + 1}. ${s.address}${s.text ? ` (${s.text.replace(/^\S+\s+/u, "")})` : ""}`).join("; ");
  return `🗺 Tomorrow: ${stops.length} stop${stops.length === 1 ? "" : "s"}. ${list}${stops.length > 4 ? `; and ${stops.length - 4} more` : ""}.${firstDrive ? ` First drive: ${firstDrive}.` : ""}`;
}

// 3. A tenant texted 2+ days ago who never answered and was not visited, no appointment: oldest first.
export function quietTenants(jobs: Job[], now = Date.now(), days = 2) {
  return jobs.filter((j) => {
    const id = String(j.OMO || j.id || "");
    if (!id || /^TEST/i.test(id)) return false;
    const texted = Date.parse(String(j.TenantTextedAt || ""));
    if (!Number.isFinite(texted) || now - texted < days * 86400000) return false;
    if (j.TenantRepliedAt || j.FieldOutcome || j.FieldArrivedAt || j.AppointmentStart || j.appointmentStart) return false;
    return !/archived/i.test(String(j.status || j.StatusOverride || "")) && !j.ArchivedFromMap;
  }).map((j) => ({ id: String(j.OMO || j.id), at: Date.parse(String(j.TenantTextedAt)) })).sort((a, b) => a.at - b.at);
}

// The follow-up the owner checks, then sends with one tap (never sent by itself).
export function followUpText(address: string, apt = "") {
  return `Hello, this is United Angel Construction. We texted you a couple of days ago about the HPD repair at ${address}${apt ? `, apartment ${apt}` : ""}. Please reply with a day and time that works for you, or call us back. Thank you!`;
}
