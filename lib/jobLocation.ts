export type JobLocationSource = Record<string, unknown> | null | undefined;

function textValue(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstText(job: JobLocationSource, keys: string[]) {
  if (!job) return "";

  for (const key of keys) {
    const value = textValue(job[key]);
    if (value) return value;
  }

  return "";
}

export function isContactLocationText(value: unknown) {
  const text = textValue(value);
  if (!text) return false;

  const digits = text.replace(/\D/g, "");
  if (/\b(fax|procurement|specialist|telephone|phone|tel|mobile|email|attn|attention)\b/i.test(text)) return true;
  if (/^\+?1?[\s().-]*\d{3}[\s().-]*\d{3}[\s.-]*\d{4}\b/.test(text)) return true;
  return digits.length >= 10 && /[:@]/.test(text);
}

export function cleanJobLocationText(value: unknown) {
  const text = textValue(value);
  if (!text || isContactLocationText(text)) return "";
  return text;
}

export function inferJobLocationFromDescription(job: JobLocationSource) {
  const description = firstText(job, [
    "ItbPage3Description",
    "itbPage3Description",
    "description",
    "JobDescription",
    "Job_Description",
    "Job Description",
    "Description",
    "WorkDescription",
    "ScopeOfWork",
  ]);
  const text = description.toLowerCase();

  if (!text) return "";
  if (/\bpublic\s+hall(?:way)?\b/.test(text)) return "Public Hall";
  if (/\bcommon\s+area\b/.test(text)) return "Common Area";
  if (/\bvestibule\b/.test(text)) return "Vestibule";
  if (/\blobby\b/.test(text)) return "Lobby";
  if (/\bbuilding\s+entrance\b/.test(text)) return "Building Entrance";
  if (/\bstairs?|stairway\b/.test(text)) return "Stairs";
  if (/\bcellar|basement|boiler|bulkhead|roof|yard\b/.test(text)) return "Common Area";

  return "";
}

export function cleanJobLocation(job: JobLocationSource) {
  const explicit = firstText(job, [
    "ItbTenantApartment",
    "itbTenantApartment",
    "ApartmentUnit",
    "Apartment",
    "Unit",
    "Apt",
    "Apt #",
    "Apt#",
    "Location",
    "location",
  ]);
  return cleanJobLocationText(explicit) || inferJobLocationFromDescription(job);
}

export function isCommonAreaLocation(value: unknown) {
  return /\b(public|hallway|hall way|public hall|vestibule|lobby|stair|cellar|basement|boiler|bulkhead|roof|yard|common area|building entrance)\b/i.test(
    textValue(value)
  );
}
