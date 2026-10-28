// Alternate side parking (owner, 27 Oct: "the AI smarter … do all of them"): is street cleaning on today / tomorrow?
// From NYC DOT's 2026 suspension calendar (nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml). Meters are
// also suspended on the major legal holidays. Snow and emergency suspensions are announced the same day (311).

const MAJOR = new Set(["New Year's Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"]);
export const ASP_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day", "2026-01-06": "Three Kings' Day", "2026-01-19": "Martin Luther King Jr.'s Birthday",
  "2026-02-12": "Lincoln's Birthday", "2026-02-16": "Presidents' Day and Lunar New Year's Eve", "2026-02-17": "Lunar New Year",
  "2026-02-18": "Ash Wednesday", "2026-03-03": "Purim", "2026-03-20": "Eid al-Fitr", "2026-03-21": "Eid al-Fitr",
  "2026-04-02": "Holy Thursday and Passover", "2026-04-03": "Good Friday and Passover", "2026-04-08": "Passover (7th day)",
  "2026-04-09": "Passover (8th day)", "2026-04-10": "Orthodox Good Friday", "2026-05-14": "Solemnity of the Ascension",
  "2026-05-22": "Shavuot", "2026-05-23": "Shavuot", "2026-05-25": "Memorial Day", "2026-05-27": "Eid al-Adha",
  "2026-05-28": "Eid al-Adha", "2026-06-19": "Juneteenth", "2026-07-03": "Independence Day", "2026-07-04": "Independence Day",
  "2026-07-23": "Tisha B'Av", "2026-08-15": "Feast of the Assumption", "2026-09-07": "Labor Day", "2026-09-12": "Rosh Hashanah",
  "2026-09-13": "Rosh Hashanah", "2026-09-21": "Yom Kippur", "2026-09-26": "Succoth", "2026-09-27": "Succoth",
  "2026-10-03": "Shemini Atzereth", "2026-10-04": "Simchas Torah", "2026-10-12": "Columbus Day", "2026-11-01": "All Saints' Day",
  "2026-11-03": "Election Day", "2026-11-08": "Diwali", "2026-11-11": "Veterans Day", "2026-11-26": "Thanksgiving Day",
  "2026-12-08": "Immaculate Conception", "2026-12-25": "Christmas Day",
};
const MAJOR_DAYS = new Set(["2026-01-01", "2026-05-25", "2026-07-03", "2026-07-04", "2026-09-07", "2026-11-26", "2026-12-25"]);

export function aspAnswer(date: string, label: "Today" | "Tomorrow") {
  const year = date.slice(0, 4);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const holiday = ASP_2026[date];
  if (weekday === 0) return `${label} is Sunday: no alternate side parking, and meters are free.${holiday ? ` (${holiday} too.)` : ""}`;
  if (year !== "2026") return `I only have the 2026 alternate side calendar. Check 311 for ${label.toLowerCase()}.`;
  if (holiday) return `${label}: alternate side parking is suspended (${holiday}).${MAJOR_DAYS.has(date) || MAJOR.has(holiday) ? " Meters are suspended too." : " Meters are still in effect."}`;
  // The next day off street cleaning, so you can plan.
  const next = Object.keys(ASP_2026).find((d) => d > date && new Date(`${d}T12:00:00Z`).getUTCDay() !== 0);
  const nextWords = next ? ` Next suspension: ${new Date(`${next}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" })} (${ASP_2026[next]}).` : "";
  return `${label}: alternate side parking is in effect: check the street signs before you park.${nextWords} Snow or emergency suspensions are announced the same day by 311.`;
}

// For the map's 🅿️ chip (28 Oct): why there's no street cleaning on this date (Sunday or a holiday), or "" when it's on.
export function aspOff(date: string) {
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) return "Sunday";
  return date.startsWith("2026") ? ASP_2026[date] || "" : "";
}
