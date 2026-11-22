// 📞 Late jobs: who to call (plan item 23, 22 Nov): next to each late or almost-due job on the ⏳ card, the person to call
// to get in, one tap away. The tenant from HPD's invitation first (signed-in private data only, never in public files);
// for a public hall or no tenant phone, the super saved for that building on this phone (🏢 on the job card).
import { cleanTenantContactName, cleanTenantPhone } from "./tenantContact";
import { buildingKey } from "./building-history";

type Row = Record<string, unknown>;
export type CallWho = { omo: string; who: string; phone: string; tel: string; kind: "tenant" | "super" };
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const first = (r: Row | undefined, keys: string[]) => { for (const k of keys) { const v = str(r?.[k]); if (v) return v; } return ""; };
const tel = (p: string) => { const d = p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `+1${d}` : ""; };

// rows: the ⏳ card rows ({omo, days}); only late ones and those due within `soon` days (default 3) get a contact.
// tenants: private data by OMO (null when not signed in). addresses: OMO -> building address. contacts: saved supers
// by building key (localStorage "hpd-building-contacts").
export function whoToCall(opts: {
  rows: { omo: string; days: number }[];
  tenants: Record<string, Row> | null | undefined;
  addresses: Record<string, string>;
  contacts: Record<string, { name?: string; phone?: string }> | null | undefined;
  soon?: number;
}): Record<string, CallWho> {
  const soon = opts.soon ?? 3;
  const out: Record<string, CallWho> = {};
  for (const r of opts.rows) {
    if (r.days > soon) continue;
    const omo = r.omo.toUpperCase();
    const t = opts.tenants?.[omo];
    const access = `${first(t, ["ItbTenantAccessType"])} ${first(t, ["ItbTenantContactStatus"])}`.toLowerCase();
    const phone = access.includes("common") ? "" : cleanTenantPhone(first(t, ["ItbTenantPhone", "TenantPhone"]));
    if (phone && tel(phone)) {
      const name = cleanTenantContactName(first(t, ["ItbTenantName", "TenantName"]));
      out[omo] = { omo, who: name ? name.split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase()).replace(/(?<=.)./g, (c) => c.toLowerCase()) : "the tenant", phone, tel: tel(phone), kind: "tenant" };
      continue;
    }
    const c = opts.contacts?.[buildingKey(opts.addresses[omo] || "")];
    const sp = c ? cleanTenantPhone(c.phone) : "";
    if (c && sp && opts.addresses[omo]) out[omo] = { omo, who: str(c.name) || "the super", phone: sp, tel: tel(sp), kind: "super" };
  }
  return out;
}
