// "No bid": the owner decided not to bid an invitation (with a reason). The checklist and the bidding session
// stop asking for it, the list shows it. Kept apart from bid records (those are faxes: win rates and fax
// counts never see a no-bid), on the phone and on the status server (key "NOBID-<OMO>") so every phone
// agrees. Undo keeps the record with undone: true (the server only merges, never deletes).

export type NoBid = { omo: string; bidDue: string; reason: string; at: string; undone?: boolean };
export const NOBID_PREFIX = "NOBID-";
const KEY = "hpd-no-bids-v1";

export const NO_BID_REASONS = ["Too far", "Price too low to be worth it", "Can't do this work", "Too busy that day", "Bad building / access", "Other"];

export function readNoBids(): Record<string, NoBid> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function writeLocal(all: Record<string, NoBid>) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: this visit only */ }
}

export async function saveNoBid(nb: NoBid, workerUrl: string, fetcher: typeof fetch = fetch) {
  const all = { ...readNoBids(), [nb.omo]: nb };
  writeLocal(all);
  try {
    await fetcher(`${workerUrl.replace(/\/$/, "")}/override`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${NOBID_PREFIX}${nb.omo}`, patch: nb }),
    });
  } catch { /* offline: kept on the phone */ }
  return all;
}

// Other phones' no-bids merged in (the later decision wins), kept on this phone.
export function mergeServerNoBids(local: Record<string, NoBid>, overrides: Record<string, unknown>) {
  const merged = { ...readNoBids(), ...local };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!key.startsWith(NOBID_PREFIX) || !value || typeof value !== "object") continue;
    const nb = value as NoBid;
    if (!nb.omo || !nb.at) continue;
    if (!merged[nb.omo] || String(nb.at) > String(merged[nb.omo].at)) merged[nb.omo] = nb;
  }
  writeLocal(merged);
  return merged;
}

// This round of the invitation was marked No bid (a re-invitation with a new due date asks again).
export function isNoBid(all: Record<string, NoBid>, bid: { omo: string; bidDue: string }) {
  const nb = all[bid.omo];
  return !!nb && !nb.undone && nb.bidDue === bid.bidDue ? nb : null;
}
