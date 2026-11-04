// What is left for a finished job (owner idea, 3 Nov): after the outcome is saved the job card lists the paperwork still
// missing (photos, affidavit, invoice) and opens the next one with one tap. Shown only: nothing is saved or sent.

export type LeftKey = "photos" | "affidavit" | "invoice";
export type LeftItem = { key: LeftKey; label: string; done: boolean; detail: string; href: string };

const WORK = ["WORK_COMPLETED", "PARTIAL_WORK"];

export function paperworkLeft(input: {
  id: string; outcome: string; before: number; after: number; approved: boolean; invoiceDone: boolean;
  paperworkHref: string; photosHref?: string;
}) {
  const { id, outcome } = input;
  if (!outcome || outcome === "APPOINTMENT_REQUESTED") return null;
  const work = WORK.includes(outcome);
  const items: LeftItem[] = [];
  if (work) {
    const missing = [input.before ? "" : "before", input.after ? "" : "after"].filter(Boolean);
    items.push({ key: "photos", label: "Photos", done: missing.length === 0,
      detail: missing.length ? `Missing ${missing.join(" and ")} photos` : `${input.before} before, ${input.after} after`,
      href: input.photosHref || input.paperworkHref });
  }
  items.push({ key: "affidavit", label: "Affidavit", done: input.approved,
    detail: input.approved ? "Approved" : "Not approved yet", href: input.paperworkHref });
  if (work) {
    items.push({ key: "invoice", label: "Invoice", done: input.invoiceDone,
      detail: input.invoiceDone ? "Sent to HPD" : "Not sent yet",
      href: `/invoice-generator?${new URLSearchParams({ job: id, outcome })}` });
  }
  const next = items.find((item) => !item.done) || null;
  return { items, next, allDone: !next, left: items.filter((item) => !item.done).length };
}
