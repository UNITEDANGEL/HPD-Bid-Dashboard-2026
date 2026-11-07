// 🌐 Remember the tenant's language (idea list, 4 Nov): when a tenant texts back in Spanish, Chinese or Russian, the app
// remembers it for that job, and every text to them after that is written in their language (the English shown next to
// it). Kept on this phone only (by work order number, nothing about the tenant), never sent anywhere.
export type TenantLang = "en" | "es" | "zh" | "ru";
export const TENANT_LANGS: TenantLang[] = ["en", "es", "zh", "ru"];
export const LANG_LABEL: Record<TenantLang, string> = { en: "English", es: "Español", zh: "中文", ru: "Русский" };
const KEY = "hpd-tenant-lang";

export function tenantLangs(): Record<string, TenantLang> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function tenantLangOf(id: string): TenantLang {
  const v = tenantLangs()[String(id || "").toUpperCase()];
  return TENANT_LANGS.includes(v) ? v : "en";
}

export function rememberTenantLang(id: string, lang: string) {
  const key = String(id || "").toUpperCase();
  if (!key || !TENANT_LANGS.includes(lang as TenantLang)) return;
  const all = tenantLangs();
  if (lang === "en") delete all[key];
  else all[key] = lang as TenantLang;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
