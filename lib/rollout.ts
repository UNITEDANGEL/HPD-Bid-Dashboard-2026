// Test first, then everyone: a new upgrade can be switched on for the test job (TEST-0001) only.
// Once it works on the phone, its entry moves from TEST_FIRST to LIVE and every job gets it, with
// no other change, because every job runs the same code.
import { TEST_JOB_ID } from "./test-job";

// Upgrades being tried on the test job only: name -> what it does (shown on the test job's card).
export const TEST_FIRST: Record<string, string> = {
  "next-job": "after the outcome, the next closest open job with directions",
};

// Upgrades already given to every job (kept so code can ask about them by name).
export const LIVE = new Set<string>([]);

export function upgradeOn(name: string, jobId: unknown) {
  if (LIVE.has(name)) return true;
  return name in TEST_FIRST && String(jobId || "").trim().toUpperCase() === TEST_JOB_ID;
}

export function testFirstUpgrades() {
  return Object.entries(TEST_FIRST).map(([name, about]) => ({ name, about }));
}
