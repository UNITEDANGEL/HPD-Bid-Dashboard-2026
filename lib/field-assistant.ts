import { jobDate, jobDateWarning, jobPriority } from "./job-priority";
import { jobQueue, savedJobStatus, visitState } from "./job-queue";

type Job = Record<string, unknown>;
export type FieldAnswer = { text: string; jobId?: string };
const idOf = (job: Job) => String(job.OMO || job.omo || job.jobId || job.id || "").toUpperCase();

// Advisory only: never writes outcomes, requests location, or invokes a paid service.
export function answerFieldQuestion(message: string, jobs: Job[], contextId = "", now = new Date()): FieldAnswer | null {
  const ids = Array.from(new Set(message.toUpperCase().match(/\b(?:E[A-Z]\d{5}|TEST-\d+)\b/g) || []));
  const question = /\?|\b(status|maturity|award|description|scope|visited|revisit|again|what next|next step|tell me|about|what happened)\b/i.test(message);
  const action = /\b(arrived|no access|refused|finished|completed|appointment|generate|email|archive|sign)\b/i.test(message);
  const routing = /\b(plan|route|nearest|nearby|shortest|prioritize|prioritise|include|exclude|remove|add|avoid)\b|\d+\s+(?:\w+\s+){0,3}(jobs|stops)\b|appointments first|finish by|last \d+ days|all boroughs/i.test(message);
  if (routing && !question && !action) return null;
  if (ids.length > 1) return { text: "Which one job should we review first? Send its work-order number. Your route and records are unchanged." };
  const id = ids[0] || contextId;
  if (id && (question || action || ids.length > 0) && !(!ids.length && /\bjobs\b/i.test(message))) {
    const job = jobs.find(row => idOf(row) === id.toUpperCase());
    if (!job) return { text: `I cannot find ${id} in the loaded jobs. Check the work-order number; I have not changed your route or records.` };
    const visit = visitState(job);
    const priority = jobPriority(job, now);
    const warning = jobDateWarning(job);
    const next = visit.blocked
      ? "Do not make another visit without reviewing this job and obtaining any required return approval."
      : jobQueue(job) === "followup"
        ? "Review the appointment or return requirements on the job card before travelling."
        : /arrived|visit.started|work.started|in.progress/i.test(savedJobStatus(job))
          ? "Your visit is already in progress. Continue on the job card: capture the appropriate evidence, record the actual outcome, then review paperwork. Do not start a duplicate visit."
          : "Open the job card, review the scope, then navigate and confirm arrival there. Record before/after evidence and the actual outcome before reviewing paperwork.";
    const description = String(job.JobDescription || job.description || "Scope is not available in the loaded record.");
    return {
      jobId: idOf(job),
      text: [
        `${idOf(job)}: ${savedJobStatus(job).replace(/_/g, " ")}.`,
        /description|scope|work required/i.test(message) ? description : "",
        `Award: ${jobDate(job, "award") || "not recorded"}. Maturity: ${priority.raw || "not recorded"}. ${priority.label}.`,
        warning,
        `${visit.count} recorded visit${visit.count === 1 ? "" : "s"}; ${visit.label}.`,
        visit.note ? `Last recorded note: ${visit.note}` : "",
        next,
        action ? "Nothing was saved, signed, sent or archived by this message. Use the job card to confirm the action." : "",
      ].filter(Boolean).join("\n"),
    };
  }
  if (/\b(overdue|oldest)\b/i.test(message) && !routing) {
    const eligible = jobs.filter(job => jobQueue(job) === "pending" && !visitState(job).blocked && !jobDateWarning(job))
      .map(job => ({ job, priority: jobPriority(job, now) }))
      .filter(row => (row.priority.days ?? 0) > 0)
      .sort((a, b) => b.priority.days! - a.priority.days!).slice(0, 5);
    return { text: eligible.length
      ? "Oldest pending jobs eligible for visit review:\n" + eligible.map(({ job, priority }) => `${idOf(job)}: ${priority.label} (maturity ${priority.raw})`).join("\n") + "\nThis is maturity order, not driving order. Ask me to plan a route when ready."
      : "No eligible overdue pending jobs with consistent dates were found in the loaded records. Follow-ups and blocked visits are excluded." };
  }
  if (routing) return null;
  return { text: action || question
    ? "Which work order? Send its OMO number so I can check its saved status, dates and visit history. I will not change a job from an unconfirmed chat message."
    : "I can review a job's status, maturity and visit history, or plan stops. Ask 'Which jobs are oldest overdue?' or send a work-order number. This is a free local assistant, not a general-purpose AI service." };
}
