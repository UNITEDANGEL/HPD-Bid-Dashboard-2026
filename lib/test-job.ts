// The test job: one sample job that is always on the map (search "TEST") so the whole field flow
// -- arrive, before/after photos, outcome, affidavit, signatures, package, email -- can be run end
// to end without touching a real work order. Every job card uses the same component, so whatever
// works on the test job works on every real job.
export const TEST_JOB_ID = "TEST-0001";

export const TEST_JOB = {
  OMO: TEST_JOB_ID,
  id: TEST_JOB_ID,
  BuildingAddress: "TEST JOB - 100 GOLD STREET, 10038",
  Location: "Public Area (Exterior)",
  ApartmentUnit: "",
  TenantName: "Sample Tenant",
  TenantPhone: "",
  WorkStartDate: "",
  WorkCompletionDate: "",
  AwardDate: "",
  AwardAmount: "100.00",
  AwardedBy: "TEST",
  JobDescription: "TEST JOB (SAMPLE ONLY - NOT A REAL WORK ORDER)\nREPAIR BUILDING ENTRANCE DOOR\nMAKE ALL NECESSARY REPAIR TO THE DOOR TO RE-ALIGN WITH FRAME. ENSURE THE DOOR IS SELF CLOSING AND LATCHING PROPERLY.\nTOTAL DOORS = 1 (ONE)\nREMOVE ALL WORK-RELATED DEBRIS.",
  Latitude: "40.710544",
  Longitude: "-74.004276",
  Geocode: "TEST",
  ITBMatchStatus: "MATCHED",
  COAParseStatus: "OK",
  IsTestJob: true,
};

export function isTestJob(id: unknown) {
  return String(id || "").trim().toUpperCase() === TEST_JOB_ID;
}

// Award date = today, so the test job always shows under 30 / 60 / 90 days.
export function withTestJob<T>(rows: T[]): T[] {
  if (rows.some((row) => isTestJob((row as { OMO?: string })?.OMO))) return rows;
  const now = new Date();
  const today = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${String(now.getFullYear()).slice(-2)}`;
  return [...rows, { ...TEST_JOB, AwardDate: today, WorkStartDate: today, WorkCompletionDate: today } as unknown as T];
}
