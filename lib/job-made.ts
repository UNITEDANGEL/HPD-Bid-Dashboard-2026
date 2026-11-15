// What each job really made (idea, 14 Nov): after a job closes, the award minus your costs (receipts), and the money per
// hour on site when the visit was timed. Numbers only. Your own time is not charged (no hourly rate is set).
import { costTotal, usd, type JobCost } from "./job-costs";

export type JobMade = { made: number; award: number; costs: number; perHour: number | null; text: string };

export function jobMade(input: { award: number; costs: JobCost[]; closed: boolean; minutesOnSite?: number | null }): JobMade | null {
  const award = Number(input.award) || 0;
  if (!input.closed || !(award > 0) || !input.costs.length) return null;
  const costs = costTotal(input.costs);
  const made = Math.round((award - costs) * 100) / 100;
  const mins = Number(input.minutesOnSite) || 0;
  const perHour = mins >= 15 && made > 0 ? Math.round((made / mins) * 60) : null;
  const sign = made < 0 ? "Lost" : "Made";
  const text = `💰 ${sign} ${usd(Math.abs(made))} on this job: ${usd(award)} award − ${usd(costs)} costs${perHour ? ` · about ${usd(perHour)} an hour on site` : ""}`;
  return { made, award, costs, perHour, text };
}
