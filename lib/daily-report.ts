// End-of-day report emailed every evening (scripts/daily-report.mjs, run by GitHub Actions): today's
// visits, outcomes and money, plus what's left to close out and tomorrow's work. Built from the same
// code as the app's My stats and Today's summary, so the numbers match the phone.
import { fieldStats } from "./field-stats";
import { daySummary, type SummaryRow } from "./day-summary";
import { secondTryState } from "./field-next-action";

type Job = Record<string, unknown>;
export type DailyReport = { subject: string; text: string; html: string };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildDailyReport(jobs: Job[], now = new Date(), appUrl = "https://hpd-bid-dashboard-2026.pages.dev/map/"): DailyReport {
  // The test job is never part of the business numbers.
  const real = jobs.filter((job) => String(job.OMO ?? job.id ?? "").trim().toUpperCase() !== "TEST-0001");
  const id = (job: Job) => String(job.OMO ?? job.id ?? "");
  const address = (job: Job) => String(job.BuildingAddress ?? job.address ?? "");
  const today = fieldStats(real, "today", {}, now);
  const week = fieldStats(real, "week", {}, now);
  const month = fieldStats(real, "month", {}, now);
  const summary = daySummary(real, { id, address }, now);
  const secondDue = real.filter((job) => secondTryState(job, now)?.due).length;
  const c = today.counts;

  const headline = `${money(today.earned)} earned · ${plural(c.visited, "visit")}`;
  const subject = `HPD day report · ${summary.dayLabel} · ${headline}`;
  const outcomes = [
    `${c.completed} completed`, `${c.partial} partial`, `${c.noAccess} no access`, `${c.refused} refused`,
    `${c.byOthers} completed by others`, `${plural(c.emailed, "package")} emailed`,
  ].join(" · ");
  const sections: [string, SummaryRow[], string][] = [
    ["Visits today", summary.visited, "Nothing recorded today."],
    ["Ready to close out", summary.closeOut, "None."],
    ["Tomorrow", summary.tomorrow, "Nothing due."],
  ];

  const text = [
    `HPD day report · ${summary.dayLabel}`,
    "",
    `EARNED TODAY: ${money(today.earned)} (${plural(c.completed + c.partial, "job")} finished ${money(today.earnedWork)} + ${plural(c.serviceCalls, "service call")} ${money(today.earnedService)})`,
    `This week: ${money(week.earned)} · This month: ${money(month.earned)}`,
    `Today: ${plural(c.visited, "visit")} · ${outcomes}`,
    secondDue ? `2nd no-access tries due now: ${secondDue}` : "",
    ...sections.flatMap(([title, rows, none]) => ["", `${title.toUpperCase()} (${rows.length})`, ...(rows.length ? rows.map((r) => `- ${r.id} · ${r.address} · ${r.text}`) : [none])]),
    "",
    `Open the app: ${appUrl}`,
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");

  const card = (label: string, value: string) => `<td style="padding:8px 10px;border:1px solid #dbe3ef;border-radius:8px;text-align:center"><div style="font:800 20px system-ui">${escape(value)}</div><div style="font:600 12px system-ui;color:#475569">${escape(label)}</div></td>`;
  const html = `<div style="font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:640px">
<h2 style="margin:0 0 4px">HPD day report · ${escape(summary.dayLabel)}</h2>
<div style="margin:10px 0;padding:14px;border-radius:12px;background:#ecfdf5;border:1px solid #86efac">
<div style="font:900 30px system-ui;color:#065f46">${escape(money(today.earned))} earned today</div>
<div style="color:#065f46">${escape(plural(c.completed + c.partial, "job"))} finished ${escape(money(today.earnedWork))} + ${escape(plural(c.serviceCalls, "service call"))} ${escape(money(today.earnedService))}</div>
<div style="color:#334155;margin-top:4px">This week ${escape(money(week.earned))} · This month ${escape(money(month.earned))}</div>
</div>
<table style="border-collapse:separate;border-spacing:6px;width:100%"><tr>${card("Visited", String(c.visited))}${card("Completed", String(c.completed))}${card("Partial", String(c.partial))}</tr><tr>${card("No access", String(c.noAccess))}${card("Refused", String(c.refused))}${card("Emailed", String(c.emailed))}</tr></table>
${secondDue ? `<p style="color:#9a3412"><b>2nd no-access tries due now: ${secondDue}</b></p>` : ""}
${sections.map(([title, rows, none]) => `<h3 style="margin:16px 0 6px">${escape(title)} (${rows.length})</h3>${rows.length ? `<ul style="margin:0;padding-left:18px">${rows.map((r) => `<li><b>${escape(r.id)}</b> · ${escape(r.address)}<br><span style="color:#475569">${escape(r.text)}</span></li>`).join("")}</ul>` : `<p style="margin:0;color:#64748b">${escape(none)}</p>`}`).join("\n")}
<p style="margin-top:18px"><a href="${escape(appUrl)}">Open the app</a></p>
</div>`;
  return { subject, text, html };
}
