// Visit record: an internal proof of every trip, arrival and try at a job, with the time and where
// the phone was. It is saved to the job's Drive folder only: never emailed, never on the affidavit
// (outgoing documents carry dates only).

export type GpsFix = { lat: number; lng: number; accuracy?: number; at?: number };
type Point = { lat: number; lng: number };
type Job = Record<string, unknown>;
type Media = { kind?: string; mediaType?: string; capturedAt?: string };

const OUTCOME_LABELS: Record<string, string> = {
  WORK_COMPLETED: "Work completed",
  PARTIAL_WORK: "Partial work",
  NO_ACCESS_1_WAITING_72H: "No access",
  REFUSED_ACCESS: "Refused access",
  WORK_COMPLETED_BY_OTHERS: "Completed by others",
  APPOINTMENT_REQUESTED: "Appointment requested",
};

export function feetBetween(a: Point, b: Point) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 20_902_231 * Math.asin(Math.sqrt(h)));
}

// Location fields for a visit-history entry, from a recent GPS fix (older than 10 minutes is ignored).
export function visitLocationFields(fix: GpsFix | null | undefined, building: Point | null, now = Date.now()) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return {};
  if (fix.at && now - fix.at > 10 * 60 * 1000) return {};
  return {
    latitude: Number(fix.lat.toFixed(6)),
    longitude: Number(fix.lng.toFixed(6)),
    ...(fix.accuracy ? { accuracyMeters: Math.round(fix.accuracy) } : {}),
    ...(building ? { feetFromJob: feetBetween(fix, building) } : {}),
  };
}

const NY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });
function when(value: unknown) {
  const time = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? NY_TIME.format(new Date(time)).replace(/,/g, "") : "";
}

function whereText(lat: unknown, lng: unknown, accuracy: unknown, feet: unknown, building: Point | null) {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat === "" || lat == null || !Number.isFinite(la) || !Number.isFinite(ln)) return "";
  const distance = Number.isFinite(Number(feet)) && feet !== "" && feet != null ? Number(feet) : building ? feetBetween({ lat: la, lng: ln }, building) : NaN;
  const parts = [
    Number.isFinite(distance) ? (distance < 1000 ? `${distance} ft from the building` : `${(distance / 5280).toFixed(1)} mi from the building`) : "",
    Number(accuracy) ? `GPS ±${Math.round(Number(accuracy))} m` : "",
    `${la.toFixed(6)}, ${ln.toFixed(6)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function visitRecordText(label: { jobId: string; address: string }, job: Job, media: Media[], building: Point | null, generatedAt = new Date().toISOString()) {
  const get = (...keys: string[]) => { for (const key of keys) { const v = job[key]; if (v !== undefined && v !== null && String(v).trim()) return v; } return ""; };
  const events: { at: number; line: string; kind: string }[] = [];
  // A saved-date field that repeats a history entry of the same kind (within a minute) is listed once,
  // by the history entry, which carries the location.
  const add = (value: unknown, text: string, kind = "") => {
    const at = Date.parse(String(value ?? ""));
    if (!Number.isFinite(at) || !text) return;
    if (events.some((event) => Math.abs(event.at - at) < 60_000 && (event.line === text || (kind && event.kind === kind)))) return;
    events.push({ at, line: text, kind });
  };
  const kindOf = (outcome: string, note: string) => /^arrived/i.test(note) && !outcome ? "arrived" : outcome === "NO_ACCESS_1_WAITING_72H" ? "no-access" : outcome === "REFUSED_ACCESS" ? "refused" : outcome;

  const via = String(get("TravelVia"));
  add(get("TravelStartedAt"), `On the way${via ? ` (${via})` : ""}`);

  const history = Array.isArray(job.FieldVisitHistory) ? (job.FieldVisitHistory as Record<string, unknown>[]) : [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const outcome = String(entry.outcome || "");
    const label = OUTCOME_LABELS[outcome] || "";
    const note = String(entry.note || "").trim();
    const where = whereText(entry.latitude, entry.longitude, entry.accuracyMeters, entry.feetFromJob, building);
    const text = [label || note, label && note ? note : "", where].filter(Boolean).join(" · ");
    add(entry.recordedAt, text, kindOf(outcome, note));
  }

  // Older jobs have no "Arrived" history entry: fall back to the saved arrival.
  const arrivedWhere = whereText(get("ArrivedLatitude"), get("ArrivedLongitude"), get("ArrivedAccuracyMeters"), "", building);
  add(get("FieldArrivedAt", "fieldArrivedAt"), `Arrived${get("ArrivedAutomatically") ? " (automatic, by GPS)" : ""}${arrivedWhere ? ` · ${arrivedWhere}` : " · location not saved"}`, "arrived");
  add(get("VisitStartedAt", "visitStartedAt"), "Visit started", "arrived");
  add(get("NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"), "No access: 1st try", "no-access");
  add(get("NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"), "No access: 2nd try", "no-access");
  add(get("RefusalDate", "refusalDate"), "Access refused", "refused");
  add(get("ActualWorkStartDate", "actualWorkStartDate", "JobStartedAt"), "Work started (before photos)", "work-started");
  add(get("ActualWorkCompletionDate", "actualWorkCompletionDate"), "Work finished (after photos)", "WORK_COMPLETED");
  events.sort((a, b) => a.at - b.at);

  const mediaLines = media
    .filter((item) => item && item.capturedAt)
    .sort((a, b) => Date.parse(String(a.capturedAt)) - Date.parse(String(b.capturedAt)))
    .map((item) => `- ${when(item.capturedAt)}  ${String(item.kind || "other").toUpperCase()} ${item.mediaType === "video" ? "video" : "photo"}`);

  return [
    "VISIT RECORD (internal proof - not part of the HPD forms)",
    `Job: ${label.jobId}${label.address ? ` · ${label.address}` : ""}`,
    ...(building ? [`Building location: ${building.lat.toFixed(6)}, ${building.lng.toFixed(6)}`] : []),
    `Made: ${when(generatedAt)} (New York time)`,
    "",
    `TIMELINE (${events.length})`,
    ...(events.length ? events.map((event) => `- ${when(event.at)}  ${event.line}`) : ["- nothing saved on the phone for this job"]),
    "",
    `PHOTOS AND VIDEOS (${mediaLines.length})`,
    ...(mediaLines.length ? mediaLines : ["- none"]),
    "",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}
