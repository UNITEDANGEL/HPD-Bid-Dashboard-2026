import { cleanJobLocation, cleanJobLocationText, isCommonAreaLocation } from "./jobLocation";

export const HPD_TENANT_CONTACT_EMAIL = "AtkinsKi@hpd.nyc.gov";
export const HPD_TENANT_CONTACT_ATTENTION = "Kizzy Atkins / K. Atkins";

type TenantContactJob = Record<string, unknown> & {
  id?: string;
  OMO?: string;
  address?: string;
  BuildingAddress?: string;
  location?: string;
  Location?: string;
  awardDate?: string;
  AwardDate?: string;
  workStartDate?: string;
  WorkStartDate?: string;
  workCompletionDate?: string;
  WorkCompletionDate?: string;
  description?: string;
  JobDescription?: string;
  tenantName?: string;
  TenantName?: string;
  tenantPhone?: string;
  TenantPhone?: string;
  ItbTenantAccessType?: string;
  ItbTenantAppointmentNeeded?: boolean | string;
  ItbTenantApartment?: string;
  ItbTenantName?: string;
  ItbTenantPhone?: string;
  ItbTenantContactStatus?: string;
};

function firstText(job: TenantContactJob | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = job?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export function cleanTenantContactName(raw: unknown) {
  const name = String(raw || "").trim();
  if (!name || /^(T|TENANT|JOHN DOE|N\/A|NA|UNKNOWN)$/i.test(name)) return "";
  return name;
}

export function tenantContactRequestEmailHref(job: TenantContactJob, apartment = "") {
  const key = firstText(job, ["id", "OMO", "omo", "jobId"]) || "Unknown OMO";
  const address =
    firstText(job, ["address", "BuildingAddress", "Address"]) ||
    cleanJobLocationText(firstText(job, ["location", "Location"])) ||
    "Not listed";
  const location = cleanJobLocation({ ...job, ItbTenantApartment: apartment }) || "Not listed";
  const awardDate = firstText(job, ["awardDate", "AwardDate", "Award Date"]) || "Not listed";
  const startDate = firstText(job, ["workStartDate", "WorkStartDate", "StartDate", "Start Date"]) || "Not listed";
  const completionDate =
    firstText(job, ["workCompletionDate", "WorkCompletionDate", "CompletionDate", "Completion Date"]) || "Not listed";
  const description =
    firstText(job, ["ItbPage3Description", "description", "JobDescription", "Job_Description", "Description"])
      .replace(/\s+/g, " ")
      .slice(0, 800) || "Not listed";
  const mapUrl = `https://hpd-bid-dashboard-2026.pages.dev/map/?omo=${encodeURIComponent(key)}&view=all`;
  const subject = `Tenant contact request - ${key} - ${address}`;
  const body = [
    `Hi ${HPD_TENANT_CONTACT_ATTENTION},`,
    "",
    "Please provide tenant contact information so we can schedule access for this HPD work order.",
    "",
    `OMO: ${key}`,
    `Address: ${address}`,
    `Apartment / location: ${location}`,
    `Award date: ${awardDate}`,
    `Work window: ${startDate} to ${completionDate}`,
    `Map link: ${mapUrl}`,
    "",
    "Page 3 description:",
    description,
    "",
    "Thank you.",
  ].join("\n");

  return `mailto:${HPD_TENANT_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function tenantContactInfo(job: TenantContactJob | null | undefined) {
  const empty = {
    accessType: "unknown",
    appointmentNeeded: false,
    label: "Tenant Contact",
    name: "",
    phone: "",
    apartment: "",
    status: "No tenant contact listed",
    actionHref: "",
    smsHref: "",
    emailHref: "",
  };

  if (!job) return empty;

  const accessType = firstText(job, ["ItbTenantAccessType", "itbTenantAccessType"]).toLowerCase();
  const explicitNeeded = job.ItbTenantAppointmentNeeded ?? job.itbTenantAppointmentNeeded;
  const apartment = cleanJobLocation(job);
  const name = cleanTenantContactName(firstText(job, ["ItbTenantName", "itbTenantName", "TenantName", "tenantName"]));
  const phone = firstText(job, ["ItbTenantPhone", "itbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]);
  const contactStatus = firstText(job, ["ItbTenantContactStatus", "itbTenantContactStatus"]).toUpperCase();
  const commonArea =
    accessType === "common_area" ||
    contactStatus === "COMMON_AREA_NO_TENANT" ||
    isCommonAreaLocation(apartment);
  const appointmentNeeded =
    !commonArea && (explicitNeeded === true || explicitNeeded === "true" || Boolean(apartment || name || phone));
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  return {
    accessType: commonArea ? "common_area" : appointmentNeeded ? "apartment" : "unknown",
    appointmentNeeded,
    label: commonArea ? "No Tenant Appointment" : "Tenant Contact",
    name,
    phone,
    apartment,
    status: commonArea
      ? "Public/common area - no tenant contact needed"
      : phone
        ? "Ready to call or text for appointment"
        : "Request contact information from HPD",
    actionHref: cleanPhone ? `tel:${cleanPhone}` : "",
    smsHref: cleanPhone ? `sms:${cleanPhone}` : "",
    emailHref: !commonArea && !cleanPhone ? tenantContactRequestEmailHref(job, apartment) : "",
  };
}
