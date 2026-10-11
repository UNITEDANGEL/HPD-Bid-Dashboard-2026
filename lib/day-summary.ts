// End-of-day summary: what happened today (New York day) and what's due tomorrow, from the job
// steps saved on the phone. Internal (sent only to the owner), so it shows times.
import { FIELD_OUTCOMES, secondTryState } from "./field-next-action";
import { activeAppointment, appointmentLabel } from "./appointments";

type Job = Record<string, unknown>;
export type SummaryRow = { id: string; address: string; text: string };
export type DaySummary = {
  day: string;
  dayLabel: string;
  counts: { visited: number; finished: number; noAccess: number; refused: number; booked: number; emailed: number; closeOut: number };
  visited: SummaryRow[];
  closeOut: SummaryRow[];
  tomorrow: SummaryRow[];
  text: string;
};

const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const NY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const day = (value: unknown) => {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? NY_DAY.format(new Date(time)) : "";
};
const clock = (value: unknown) => NY_TIME.format(new Date(Date.parse(String(value))));
const str = (job: Job, ...keys: string[]) => { for (const key of keys) { const v = job[key]; if (v !== undefined && v !== null && String(v).trim()) return String(v); } return ""; };
const weekdayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
};
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export function daySummary(jobs: Job[], get: { id: (job: Job) => string; address: (job: Job) => string }, now = new Date()): DaySummary {
  const today = NY_DAY.format(now);
  const tomorrow = addDays(today, 1);
  const counts = { visited: 0, finished: 0, noAccess: 0, refused: 0, booked: 0, emailed: 0, closeOut: 0 };
  let visited: SummaryRow[] = [];
  const visitedAt = new Map<number, number>();
  const closeOut: SummaryRow[] = [];
  const due: SummaryRow[] = [];

  for (const job of jobs) {
    const id = get.id(job);
    const address = get.address(job);
    const history = (Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : []) as Record<string, unknown>[];
    const todays = history.filter((entry) => entry && day(entry.recordedAt) === today);
    const outcome = str(job, "FieldOutcome", "fieldOutcome");
    const arrived = [str(job, "FieldArrivedAt", "fieldArrivedAt"), ...todays.filter((e) => /^arrived/i.test(String(e.note || "")) && !e.outcome).map((e) => String(e.recordedAt))].find((v) => day(v) === today) || "";
    const workedToday = Boolean(arrived) || todays.length > 0 || day(str(job, "TravelStartedAt")) === today;
    const booking = (Array.isArray(job.AppointmentHistory) ? job.AppointmentHistory : []).some((a) => a && day((a as Record<string, unknown>).updatedAt) === today);
    const emailedToday = day(str(job, "PackageEmailedAt")) === today;

    if (workedToday || booking || emailedToday) {
      const parts: string[] = [];
      if (arrived) {
        const feet = todays.find((e) => /^arrived/i.test(String(e.note || "")) && e.feetFromJob !== undefined)?.feetFromJob;
        parts.push(`arrived ${clock(arrived)}${feet !== undefined ? ` (${feet} ft from the building)` : ""}`);
      }
      const finalToday = todays.filter((e) => e.outcome && FIELD_OUTCOMES[String(e.outcome)]).pop();
      if (finalToday) parts.push(`${FIELD_OUTCOMES[String(finalToday.outcome)]}${finalToday.note ? ` (${finalToday.note})` : ""}`);
      else if (todays.length || arrived) parts.push(outcome && FIELD_OUTCOMES[outcome] ? FIELD_OUTCOMES[outcome] : "no outcome saved yet");
      const second = secondTryState(job, now);
      if (finalToday && String(finalToday.outcome) === "NO_ACCESS_1_WAITING_72H") {
        counts.noAccess += 1;
        parts.push(second ? `2nd try from ${second.dueLabel}` : "2nd try saved: ready for the affidavit");
      }
      if (finalToday && ["WORK_COMPLETED", "PARTIAL_WORK"].includes(String(finalToday.outcome))) counts.finished += 1;
      if (finalToday && String(finalToday.outcome) === "REFUSED_ACCESS") counts.refused += 1;
      const appointment = activeAppointment(job);
      if (booking && appointment) { counts.booked += 1; parts.push(`appointment booked for ${appointmentLabel(appointment)}`); }
      if (emailedToday) { counts.emailed += 1; parts.push("package emailed"); }
      if (workedToday) counts.visited += 1;
      // In the order things happened: the first thing recorded on this job today.
      const times = [arrived, str(job, "TravelStartedAt"), ...todays.map((e) => String(e.recordedAt)), str(job, "PackageEmailedAt"),
        ...((Array.isArray(job.AppointmentHistory) ? job.AppointmentHistory : []) as Record<string, unknown>[]).map((a) => String(a?.updatedAt || ""))]
        .filter((v) => day(v) === today).map((v) => Date.parse(v));
      visitedAt.set(visited.length, times.length ? Math.min(...times) : Infinity);
      visited.push({ id, address, text: parts.join(" · ") });
    }

    // Finished in the field, package not approved yet (not waiting for a 2nd try or an appointment).
    const finalOutcome = FIELD_OUTCOMES[outcome] && !/^APPOINTMENT/.test(outcome) && !secondTryState(job, now);
    const approved = Boolean(str(job, "PackageApprovedAt")) || /approved/i.test(str(job, "PackageReviewStatus"));
    if (finalOutcome && !approved && !job.ArchivedFromMap) {
      counts.closeOut += 1;
      closeOut.push({ id, address, text: FIELD_OUTCOMES[outcome] });
    }

    // Tomorrow: appointments, and 2nd tries that are due by then.
    const appointment = activeAppointment(job);
    if (appointment && appointment.date === tomorrow) due.push({ id, address, text: `📅 appointment ${appointmentLabel(appointment)}` });
    const second = secondTryState(job, now);
    if (second && second.dueDay <= tomorrow) due.push({ id, address, text: `🔒 2nd try (no access) ${second.due ? "due now" : `from ${second.dueLabel}`}` });
  }

  visited = visited.map((row, index) => ({ row, at: visitedAt.get(index) ?? Infinity })).sort((a, b) => a.at - b.at).map(({ row }) => row);
  const line = (row: SummaryRow) => `- ${row.id} · ${row.address}: ${row.text}`;
  const dayLabel = weekdayLabel(today);
  const text = [
    `HPD field summary · ${dayLabel}`,
    "",
    `Visited ${counts.visited} · finished ${counts.finished} · no access ${counts.noAccess} · refused ${counts.refused} · appointments booked ${counts.booked} · packages emailed ${counts.emailed}`,
    "",
    `TODAY (${visited.length})`,
    ...(visited.length ? visited.map(line) : ["- nothing recorded today"]),
    "",
    `READY TO CLOSE OUT (${closeOut.length})`,
    ...(closeOut.length ? closeOut.map(line) : ["- none"]),
    "",
    `TOMORROW · ${weekdayLabel(tomorrow)} (${due.length})`,
    ...(due.length ? due.map(line) : ["- nothing due"]),
    "",
  ].join("\n");
  return { day: today, dayLabel, counts, visited, closeOut, tomorrow: due, text };
}
