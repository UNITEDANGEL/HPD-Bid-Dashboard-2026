// 👷 Send a job to your worker (app idea list: "one tap texts a worker the address, the work and the photos needed"):
// the text for the phone's share sheet. The tenant's name and phone go in only when you tick it; the super (saved on
// this phone) goes in when there is one.

export type CrewJob = {
  id: string; address: string; apt?: string; work: string[]; completeBy?: string;
  contact?: { name: string; phone: string; note?: string } | null;
  tenant?: { name?: string; phone?: string } | null; // only when you chose to include it
  photos?: { label: string; done: boolean }[];
};

const phone = (p: string) => { const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, NY`)}`;

export function crewText(j: CrewJob) {
  const out = [`HPD job ${j.id}`, `📍 ${j.address.replace(/,\s*\d{5}$/, "")}${j.apt ? `, apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : ""}`];
  if (j.completeBy) out.push(`Finish by ${j.completeBy}`);
  if (j.work.length) out.push("", "The work:", ...j.work.slice(0, 10).map((w) => `• ${w}`));
  const missing = (j.photos || []).filter((p) => !p.done).map((p) => p.label.toLowerCase());
  out.push("", `📸 Photos HPD needs: ${missing.length ? missing.join(", ") : "all taken already"}. Same spot before and after, lights on.`);
  if (j.contact) out.push("", `🏢 Building: ${j.contact.name} ${phone(j.contact.phone)}${j.contact.note ? ` (${j.contact.note})` : ""}`);
  if (j.tenant && (j.tenant.name || j.tenant.phone)) out.push(`🔔 Tenant: ${[j.tenant.name, j.tenant.phone ? phone(j.tenant.phone) : ""].filter(Boolean).join(" ")}`);
  out.push("", `Map: ${mapsLink(j.address)}`);
  return out.join("\n");
}
