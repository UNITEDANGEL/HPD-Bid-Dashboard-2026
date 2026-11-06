// 📸 Photos before paperwork (plan item 28): HPD needs before and after photos with the affidavit and invoice when the
// work was done. The paperwork card says what's missing, before you send.
export function photoGap(outcome: string, counts: { before: number; after: number } | null | undefined) {
  if (!/WORK_COMPLETED|PARTIAL/i.test(String(outcome || ""))) return "";
  const b = counts?.before || 0, a = counts?.after || 0;
  if (b && a) return "";
  const what = !b && !a ? "No before or after photos" : !b ? "No before photos" : "No after photos";
  return `📸 ${what} on this phone yet. HPD needs them with the affidavit and invoice.`;
}
