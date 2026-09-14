export type AffidavitKind = "work-performed" | "no-work-performed";
export type AffidavitVersion = "legacy" | "current";
export type AffidavitGenerationType = "Work Completed" | "No Work Completed";

export type AffidavitTemplate = {
  kind: AffidavitKind;
  version: AffidavitVersion;
  title: string;
  shortTitle: string;
  href: string;
  useWhen: string;
  generationType: AffidavitGenerationType;
};

export type AffidavitSet = {
  version: AffidavitVersion;
  label: string;
  rule: string;
  templates: AffidavitTemplate[];
};

export const AFFIDAVIT_EFFECTIVE_DATE_ISO = "2026-08-28";
export const AFFIDAVIT_EFFECTIVE_LABEL = "Effective Aug 28, 2026";
export const AFFIDAVIT_VERSION_LABEL = "Updated Version 8-28-26";
export const AFFIDAVIT_LEGACY_LABEL = "Legacy forms before Aug 28, 2026";

export const AFFIDAVIT_SETS: AffidavitSet[] = [
  {
    version: "legacy",
    label: AFFIDAVIT_LEGACY_LABEL,
    rule: `Award date before ${AFFIDAVIT_EFFECTIVE_DATE_ISO}`,
    templates: [
      {
        kind: "work-performed",
        version: "legacy",
        title: "Work Performed Affidavit",
        shortTitle: "Work Performed",
        href: "/affidavit-templates/affidavit-work-performed-before-2026-08-28.pdf",
        useWhen: "Use when work was fully or partially performed.",
        generationType: "Work Completed",
      },
      {
        kind: "no-work-performed",
        version: "legacy",
        title: "No Work Performed Affidavit",
        shortTitle: "No Work",
        href: "/affidavit-templates/affidavit-no-work-performed-before-2026-08-28.pdf",
        useWhen: "Use when no repair work was performed.",
        generationType: "No Work Completed",
      },
    ],
  },
  {
    version: "current",
    label: `${AFFIDAVIT_VERSION_LABEL} (${AFFIDAVIT_EFFECTIVE_LABEL})`,
    rule: `Award date on or after ${AFFIDAVIT_EFFECTIVE_DATE_ISO}`,
    templates: [
      {
        kind: "work-performed",
        version: "current",
        title: "Work Performed Affidavit",
        shortTitle: "Work Performed",
        href: "/affidavit-templates/affidavit-work-performed-effective-2026-08-28.pdf",
        useWhen: "Use when work was fully or partially performed.",
        generationType: "Work Completed",
      },
      {
        kind: "no-work-performed",
        version: "current",
        title: "No Work Performed Affidavit",
        shortTitle: "No Work",
        href: "/affidavit-templates/affidavit-no-work-performed-effective-2026-08-28.pdf",
        useWhen: "Use when no repair work was performed.",
        generationType: "No Work Completed",
      },
    ],
  },
];

export const AFFIDAVIT_TEMPLATES = AFFIDAVIT_SETS.find((set) => set.version === "current")?.templates || [];

function parseDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : slash
      ? new Date(
        Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]),
        Number(slash[1]) - 1,
        Number(slash[2]),
      )
      : new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function affidavitSetForAwardDate(awardDate: string) {
  const cutoff = parseDate(AFFIDAVIT_EFFECTIVE_DATE_ISO);
  const date = parseDate(awardDate);
  const version: AffidavitVersion = cutoff && date && date < cutoff ? "legacy" : "current";
  return AFFIDAVIT_SETS.find((set) => set.version === version) || AFFIDAVIT_SETS[1];
}

export function affidavitKindForStatus(status: string): AffidavitKind | null {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes("no access") ||
    normalized.includes("refused") ||
    normalized.includes("no work") ||
    normalized.includes("work completed by other") ||
    normalized.includes("done by other")
  ) {
    return "no-work-performed";
  }

  if (
    normalized.includes("completed") ||
    normalized.includes("partial") ||
    normalized.includes("work in progress") ||
    normalized.includes("work started") ||
    normalized.includes("needs materials") ||
    normalized.includes("follow up")
  ) {
    return "work-performed";
  }

  return null;
}

export function affidavitTypeForStatus(status: string): AffidavitGenerationType {
  return affidavitKindForStatus(status) === "no-work-performed" ? "No Work Completed" : "Work Completed";
}

export function affidavitTemplateForStatus(status: string, awardDate = "") {
  const kind = affidavitKindForStatus(status);
  if (!kind) return null;
  return affidavitSetForAwardDate(awardDate).templates.find((template) => template.kind === kind) || null;
}
