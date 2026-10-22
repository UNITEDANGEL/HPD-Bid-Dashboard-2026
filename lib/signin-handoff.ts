// Signing in from the iPhone Home Screen app (owner, 22 Oct: "why 0 all"): Google opens in a separate browser sheet,
// so the sign-in lands in that sheet's cookies, not the app's. Every "sign in with Google" form gets a one-time code
// when the app runs from the Home Screen; when the app is back on screen it claims the sign-in with that code
// (server/drive-auth.mjs "claim") and reloads with your HPD emails.

const KEY = "hpd-signin-handoff";
const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const code = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };

export function installSigninHandoff(force = false) {
  if (typeof document === "undefined") return () => {};
  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement | null;
    if (!form?.action || !/\/api\/drive\/start/.test(form.action) || (!force && !standalone())) return;
    const handoff = code();
    try { localStorage.setItem(KEY, JSON.stringify({ handoff, at: Date.now() })); } catch { return; }
    const url = new URL(form.action, location.origin);
    url.searchParams.set("handoff", handoff);
    form.action = url.pathname + url.search;
  };
  document.addEventListener("submit", onSubmit, true);
  return () => document.removeEventListener("submit", onSubmit, true);
}

// Back in the app: pick the sign-in up (true when it worked).
export async function claimSignin(fetcher: typeof fetch = fetch) {
  let saved: { handoff?: string; at?: number } | null = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { saved = null; }
  if (!saved?.handoff) return false;
  if (Date.now() - (saved.at || 0) > 15 * 60000) { try { localStorage.removeItem(KEY); } catch { /* private mode */ } return false; }
  try {
    const r = await fetcher("/api/drive/claim", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff: saved.handoff }) });
    const d = await r.json().catch(() => ({}));
    if (d?.claimed) { try { localStorage.removeItem(KEY); } catch { /* private mode */ } return true; }
  } catch { /* offline: try again when the app comes back */ }
  return false;
}
