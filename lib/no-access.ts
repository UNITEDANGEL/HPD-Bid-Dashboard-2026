// Rules for the No Access affidavit (items 4a and 4b).

export const NO_ACCESS_MIN_GAP_HOURS = 72;
const DAY_MS = 24 * 60 * 60 * 1000;

// Paperwork form dates are MM/DD/YY (displayDate); date inputs give YYYY-MM-DD.
export function parseFormDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return new Date(year, Number(us[1]) - 1, Number(us[2]));
  }
  return null;
}

// YYYY-MM-DD for <input type="date">.
export function dateInputValue(value: unknown) {
  const date = parseFormDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysBetween(first: Date, second: Date) {
  // Round to absorb daylight-saving hour shifts between local midnights.
  return Math.round((second.getTime() - first.getTime()) / DAY_MS);
}

// The form prints dates only, so 72 hours means the second attempt is at least 3 calendar days after the first.
export function noAccessAttemptProblem(firstAttempt: unknown, secondAttempt: unknown) {
  const first = parseFormDate(firstAttempt);
  const second = parseFormDate(secondAttempt);
  if (!first) return "Enter the 1st access attempt date.";
  if (!second) return "Enter the 2nd access attempt date.";
  const days = daysBetween(first, second);
  const minDays = NO_ACCESS_MIN_GAP_HOURS / 24;
  if (days < minDays) {
    const apart = days === 1 ? "1 day" : `${days} days`;
    return days < 0
      ? "The 2nd access attempt is before the 1st. Check the attempt dates."
      : `Access attempts must be at least ${NO_ACCESS_MIN_GAP_HOURS} hours apart. These are ${apart} apart; the 2nd attempt needs to be on or after ${formatShort(new Date(first.getTime() + minDays * DAY_MS))}.`;
  }
  return "";
}

function formatShort(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${String(date.getFullYear()).slice(-2)}`;
}

// Text for item 4b when there is no tenant phone number to call, naming the common area when known.
export function noTelephoneNote(commonArea: boolean, location = "") {
  if (!commonArea) return "NO TELEPHONE NUMBER AVAILABLE";
  return `NO TELEPHONE NUMBER AVAILABLE - ${String(location || "").trim().toUpperCase() || "PUBLIC HALLWAY"}`;
}
