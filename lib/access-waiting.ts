// Jobs waiting on access (idea, 14 Nov): jobs where the tenant never gave access, with the date of each try,
// so the no-access paperwork is ready. Built from the "No access proof:" notes saved on the phone (lib/no-access-proof.ts).
// Jobs already sent to HPD are left out. OMO numbers and dates only, no tenant data.
export type AccessWaiting = { omo: string; tries: string[]; lastTry: string };

const NY = "America/New_York";
const dayOf = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: NY }); };

export function accessWaiting(input: {
  notes: Record<string, { text?: string; at?: string }[]> | null | undefined;
  sent?: Record<string, unknown> | null;
}): AccessWaiting[] {
  const out: AccessWaiting[] = [];
  for (const [omo, list] of Object.entries(input.notes || {})) {
    if (!Array.isArray(list) || (input.sent && input.sent[omo]) || /^TEST-/i.test(omo)) continue;
    const tries = [...new Set(list.filter((n) => /^No access proof:/i.test(String(n?.text || ""))).map((n) => dayOf(String(n?.at || ""))).filter(Boolean))].sort();
    if (tries.length) out.push({ omo, tries, lastTry: tries[tries.length - 1] });
  }
  return out.sort((a, b) => a.lastTry.localeCompare(b.lastTry) || a.omo.localeCompare(b.omo));
}

// "Nov 3 · Nov 7" for the card.
export function triesText(tries: string[]): string {
  return tries.map((t) => new Date(`${t}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })).join(" · ");
}
