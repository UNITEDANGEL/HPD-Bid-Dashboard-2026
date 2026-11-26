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

// 20 Nov (owner: "I opened the job card, it takes me to navigation; it should take me to the real job card"): the job card
// link comes right under the job number (the phone opens the first link of a message), and no map link (the card has Navigate).
export function crewText(j: CrewJob, cardLink = "") {
  const out = [`HPD job ${j.id}`, ...(cardLink ? [`👷 Open your job card (photos, call, navigate): ${cardLink}`] : []), `📍 ${j.address.replace(/,\s*\d{5}$/, "")}${j.apt ? `, apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : ""}`];
  // 🧭 Navigation link right under the address (owner, 25 Nov: "send the details ... with the navigation link and everything").
  if (cardLink) out.push(`🧭 Navigate: ${mapsLink(j.address)}`);
  if (j.where) out.push(`🚪 Where: ${j.where}`);
  if (j.completeBy) out.push(`⏰ HPD expects it done by ${j.completeBy}`);
  if (j.work.length) out.push("", "The work:", ...j.work.slice(0, 10).map((w) => `• ${w}`));
  if (j.full) out.push("", "HPD's full description:", j.full);
  const missing = (j.photos || []).filter((p) => !p.done).map((p) => p.label.toLowerCase());
  out.push("", `📸 Photos HPD needs: ${missing.length ? missing.join(", ") : "all taken already"}. Same spot before and after, lights on.`);
  if (cardLink) out.push("Take them on your job card (first link): tap BEFORE or AFTER, then Photo or Video. They go straight to the boss's job card, labeled. No WhatsApp needed.");
  if (j.contact) out.push("", `🏢 Building: ${j.contact.name} ${phone(j.contact.phone)}${j.contact.note ? ` (${j.contact.note})` : ""}`);
  if (j.tenant && (j.tenant.name || j.tenant.phone)) out.push(`🔔 Tenant: ${[j.tenant.name, j.tenant.phone ? phone(j.tenant.phone) : ""].filter(Boolean).join(" ")}`);
  if (!cardLink) out.push("", `Map: ${mapsLink(j.address)}`);
  return out.join("\n");
}

// 📍 The rooms / spots HPD's description names (owner, 26 Nov: "the description tells you where you are ... the kitchen
// window, add it in the list"): "AT BUILDING ENTRANCE DOOR. AT PUBLIC HALL 1ST STORY" -> "Building entrance door",
// "Public hall 1st story"; "WASH BASIN IN THE BATHROOM" -> "Bathroom wash basin"; "AT BEDROOM:" -> "Bedroom".
const ROOM = "KITCHEN|BATHROOM|BEDROOM|LIVING ROOM|DINING ROOM|FOYER|HALLWAY|PUBLIC HALL(?:WAY)?|HALL|LOBBY|VESTIBULE|CORRIDOR|STAIR(?:S|CASE|WELL)?|ROOF|BASEMENT|CELLAR|BOILER ROOM|CLOSET|ENTRANCE|COURTYARD|YARD|FIRE ESCAPE";
const FIX = "WINDOWS?|DOORS?|CEILING|WALLS?|FLOOR(?:ING)?|SINK|WASH BASIN|BASIN|TUB|BATHTUB|SHOWER|TOILET|RADIATORS?|OUTLETS?|LIGHT(?:ING)?|FIXTURES?|CABINETS?|STOVE|RANGE|REFRIGERATOR|FAUCET|TILES?|PIPES?|BELL|INTERCOM|SMOKE DETECTOR|CARBON MONOXIDE DETECTOR";
const nice = (v: string) => { const t = v.toLowerCase().replace(/\s+/g, " ").trim(); const cut = t.length > 30 ? t.slice(0, 30).replace(/\s+\S*$/, "").replace(/\s+(and|or|&|to|the|of|at|in)$/, "") : t; return cut ? cut[0].toUpperCase() + cut.slice(1) : ""; };
export function workRooms(desc: string): string[] {
  const text = String(desc || "").replace(/\r?\n/g, " ").split(/CONTRACTOR MUST|NOTE\s*\d*\s*[:-]/i)[0].replace(/\s+/g, " ").toUpperCase();
  const out: string[] = [];
  const add = (v: string) => { const n = nice(v); if (n && n.length > 2 && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n); };
  for (const m of text.matchAll(/\bAT\s+(?:THE\s+)?([A-Z0-9 /&-]+?)(?=[.:;,]|\bLOCATED\b|\bAT\b|\bIN PROPER\b|$)/g)) {
    const v = m[1].trim().replace(/\s+(AND|OR|&)$/, "");
    if (/\b(IN THE|LEADING|FROM)\b/.test(v)) continue;
    if (/^(APT|APARTMENT)\b/.test(v) || /^\d/.test(v) || /^(LEAST|ALL|EACH|ONCE|NO|A|AN)\b/.test(v) || v.split(" ").length > 6) continue;
    if (new RegExp(`\\b(${ROOM}|${FIX})\\b`).test(v)) add(v);
  }
  for (const m of text.matchAll(new RegExp(`\\b(${FIX})\\s+(?:IN|OF|AT|ON)\\s+(?:THE\\s+)?(${ROOM})\\b`, "g"))) add(`${m[2]} ${m[1]}`);
  for (const m of text.matchAll(new RegExp(`\\b(${ROOM})\\s+(${FIX})\\b`, "g"))) add(`${m[1]} ${m[2]}`);
  for (const m of text.matchAll(new RegExp(`\\b(${ROOM})\\b`, "g"))) add(m[1]);
  return out.slice(0, 6);
}
