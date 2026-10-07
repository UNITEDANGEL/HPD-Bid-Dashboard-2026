import { calendarDay, jobDate, jobDateWarning } from "./job-priority";
import { longestCleanDescription } from "./description-quality";

export function packageReadiness(job: Record<string, unknown>, media: { before: number; after: number } | null) {
  const issues: string[] = [];
  const award = calendarDay(jobDate(job, "award"));
  const template = award === null ? "Award date required" : award < calendarDay("2026-08-28")! ? "Legacy affidavit required" : "August 28, 2026 affidavit";
  if (award === null) issues.push("Verify the award date; actual work dates do not determine the affidavit version.");
  else if (award < calendarDay("2026-08-28")!) issues.push("Legacy affidavit generation is not supported by the current generator. Do not use the new form for this award.");
  const warning = jobDateWarning(job);
  if (warning) issues.push(warning);
  if (!longestCleanDescription(job, ["JobDescription", "description", "Description", "ITBDescription"])) issues.push("Verify a readable work description against the ITB.");
  if (!String(job.BuildingAddress || job.address || job.Address || "").trim()) issues.push("Building address is missing.");
  const amount = Number(String(["AwardAmount", "COAAwardAmount", "Amount", "amount"].map(key => job[key]).find(value => value !== undefined && value !== null && String(value).trim()) || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) issues.push("Verify the award amount against the COA before reviewing invoice charges.");
  const outcome = String(job.FieldOutcome || "").toUpperCase();
  const work = ["WORK_COMPLETED", "PARTIAL_WORK"].includes(outcome);
  const noWork = ["NO_ACCESS", "NO_ACCESS_1_WAITING_72H", "NO_ACCESS_2_COMPLETE", "REFUSED_ACCESS", "WORK_COMPLETED_BY_OTHERS"].includes(outcome);
  if (!work && !noWork) issues.push("Confirm the actual visit outcome on the job card before generating paperwork.");
  if (!media) issues.push("Media counts have not loaded on this device; evidence completeness is unknown.");
  else if (work) {
    if (!media.before) issues.push("No before photo or video is recorded on this device.");
    if (!media.after) issues.push("No after photo or video is recorded on this device.");
  }
  const start = calendarDay(String(job.ActualWorkStartDate || job.actualWorkStartDate || ""));
  const finish = calendarDay(String(job.ActualWorkCompletionDate || job.actualWorkCompletionDate || ""));
  if (work && (start === null || finish === null)) issues.push("Confirm actual work start and finish dates in the paperwork review; contract dates are different.");
  if (start !== null && finish !== null && finish < start) issues.push("Actual work finish precedes actual work start. Correct the dates before approval.");
  return { template, issues, review: "Pre-check only. Review invoice amounts, all PDF pages, signatures, attachment size and Drive/email delivery separately. Nothing is generated or sent by this check." };
}
