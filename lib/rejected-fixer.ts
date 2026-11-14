// 🔧 Rejected job fixer (owner idea, 14 Nov): when HPD rejects a job's paperwork, list exactly what to redo,
// and when the fix needs a visit (new photos, work not done, access) put that job first on tomorrow's route.
// Pure functions: no tenant data leaves the phone.

export type RejectionInput = { rejectedTs?: number; rejectedAt?: string; rejectedReason?: string; repliedTs?: number };
export type RejectedFix = { omo: string; at: string; todo: string[]; needsVisit: boolean };

const VISIT = /photo|picture|before and after|re-?do|redo|not complete|incomplete|work not|access|revisit|return to|go back|inspect/i;

// "1. Same area on both. 2. Dates do not match." -> ["Same area on both.", "Dates do not match."]
export function whatToRedo(reason: string): string[] {
  const text = String(reason || "").replace(/\s+/g, " ").trim();
  if (!text) return ["Read HPD's rejection note"];
  const parts = text.split(/(?:^|\s)\d+\s*[.)]\s+/).map((s) => s.trim()).filter(Boolean);
  return (parts.length ? parts : [text]).map((s) => (s.length > 140 ? s.slice(0, 137).trimEnd() + "..." : s)).slice(0, 5);
}

export function rejectedFixes(asked: Record<string, RejectionInput>, correctedAt: Record<string, string> = {}, today = new Date(), maxDays = 30): Record<string, RejectedFix> {
  const out: Record<string, RejectedFix> = {};
  for (const [omo, r] of Object.entries(asked || {})) {
    if (!r?.rejectedTs) continue;
    const age = (today.getTime() - r.rejectedTs) / 86400000;
    if (age < 0 || age > maxDays) continue;
    if (r.repliedTs && r.repliedTs > r.rejectedTs) continue;
    const fixed = correctedAt[omo.toUpperCase()];
    if (fixed && fixed >= (r.rejectedAt || "")) continue;
    out[omo.toUpperCase()] = { omo: omo.toUpperCase(), at: r.rejectedAt || "", todo: whatToRedo(r.rejectedReason || ""), needsVisit: VISIT.test(r.rejectedReason || "") };
  }
  return out;
}
