// 👷 Send a job to your worker (app idea list: "one tap texts a worker the address, the work and the photos needed"):
// the text for the phone's share sheet. The tenant's name and phone go in only when you tick it; the super (saved on
// this phone) goes in when there is one.

export type CrewJob = {
  id: string; address: string; apt?: string; work: string[]; completeBy?: string;
  contact?: { name: string; phone: string; note?: string } | null;
  tenant?: { name?: string; phone?: string } | null; // only when you chose to include it
  photos?: { label: string; done: boolean }[];
  where?: string | null; // 20 Nov: "is this location apartment or public hallway?" (from workWhere)
  full?: string; // 20 Nov: "the description should be in the package": HPD's whole work description
};

// 📍 Where the work is (owner, 20 Nov: "Where's the location? Public hallway? Or is this location apartment"), read from
// HPD's description: the first "AT …" / "LOCATION: …" / "LOCATED AT …" line, and whether it's inside an apartment or a public part.
const PUBLIC = /PUBLIC\s*HAL\s*L?|HALLWAY|STAIR|BULKHEAD|ROOF|ENTRANCE|VESTIBULE|LOBBY|CELLAR|BASEMENT|LANDING|COURTYARD|BOILER|COMMON AREA|ENTIRE BUILDING/i;
const INSIDE = /\bAPT\b|APARTMENT|KITCHEN|BATH\s*ROOM|BEDROOM|LIVING\s*ROOM|DINING|FOYER|CLOSET/i;
export function workWhere(desc: string, apt?: string): string | null {
  const lines = String(desc || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const spot = lines.find((l) => /^(AT\b|LOCATIONS?\b)|LOCATED AT/i.test(l)) || "";
  const detail = spot.replace(/^LOCATIONS?:?\s*/i, "").replace(/^AT\s+/i, "").replace(/[.,;:]\s*$/, "").slice(0, 120);
  const look = spot || lines.slice(0, 6).join(" ");
  const aptNo = (apt || "").replace(/^apt\.?\s*/i, "");
  const inside = /\bAPT\b|APARTMENT/i.test(spot) || (!PUBLIC.test(look) && (INSIDE.test(look) || Boolean(aptNo)));
  if (inside) return `Inside the apartment${aptNo ? ` (apt ${aptNo})` : ""}${detail && !/^APT\b/i.test(detail) ? `: ${detail.toLowerCase()}` : ""}`;
  if (PUBLIC.test(look)) return `Public part of the building (not inside an apartment)${detail ? `: ${detail.toLowerCase()}` : ""}`;
  return null;
}

// HPD's whole description for the worker, without the banner lines and anything with a price.
export function workFull(desc: string): string {
  return String(desc || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/EMERGENCY OPERATIONS DIVISION|ESSENTIAL SERVICE WORK/i.test(l) && !/\$\s*\d/.test(l)).join("\n").slice(0, 1500);
}

const phone = (p: string) => { const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, NY`)}`;

export function crewText(j: CrewJob) {
  const out = [`HPD job ${j.id}`, `📍 ${j.address.replace(/,\s*\d{5}$/, "")}${j.apt ? `, apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : ""}`];
  if (j.where) out.push(`🚪 Where: ${j.where}`);
  if (j.completeBy) out.push(`Finish by ${j.completeBy}`);
  if (j.work.length) out.push("", "The work:", ...j.work.slice(0, 10).map((w) => `• ${w}`));
  if (j.full) out.push("", "HPD's full description:", j.full);
  const missing = (j.photos || []).filter((p) => !p.done).map((p) => p.label.toLowerCase());
  out.push("", `📸 Photos HPD needs: ${missing.length ? missing.join(", ") : "all taken already"}. Same spot before and after, lights on.`);
  if (j.contact) out.push("", `🏢 Building: ${j.contact.name} ${phone(j.contact.phone)}${j.contact.note ? ` (${j.contact.note})` : ""}`);
  if (j.tenant && (j.tenant.name || j.tenant.phone)) out.push(`🔔 Tenant: ${[j.tenant.name, j.tenant.phone ? phone(j.tenant.phone) : ""].filter(Boolean).join(" ")}`);
  out.push("", `Map: ${mapsLink(j.address)}`);
  return out.join("\n");
}
