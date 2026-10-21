"use client";
// Phone alerts (owner, 20 Oct: "ring for all notifications", also with the app closed): this phone asks for permission,
// gets a push address from the phone's maker (Apple / Google) and hands it to the server (encrypted there). The 10-minute
// fetcher sends the alerts. On an iPhone this only works in the app added to the Home Screen (iOS 16.4+).

// The public half of the alert key (the private half is a GitHub secret).
export const PUSH_PUBLIC_KEY = "BBmtmIohi2rinq4pj68d--uCtbicYU9SraMID56vmadykHCEtF0kuoEBQshq0N81V7BhHK-ovdLmvLrutzdv1M0";
const ON_KEY = "hpd-push-on";

export type PushState = "on" | "off" | "blocked" | "need-home-screen" | "unsupported";

export function isHomeScreenApp() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
const isIphone = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!ok) return isIphone() && !isHomeScreenApp() ? "need-home-screen" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub && localStorage.getItem(ON_KEY) === "1" ? "on" : "off";
  } catch { return "off"; }
}

function keyBytes(b64url: string) {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function deviceName() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : /Mac/.test(ua) ? "Mac" : "phone";
}

// Called from a tap (iPhone only asks for permission after a tap).
export async function turnOnPush(fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  const state = await pushState();
  if (state === "need-home-screen") return { ok: false, message: "On the iPhone, alerts work in the app on your Home Screen: in Safari tap Share → Add to Home Screen, open HPD Field from the icon, then tap this again." };
  if (state === "unsupported") return { ok: false, message: "This browser can't show phone alerts." };
  if (state === "blocked") return { ok: false, message: "Alerts are blocked for this app: Settings → Notifications → HPD Field → Allow Notifications, then tap this again." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Alerts were not allowed. Tap again and choose Allow." };
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) }));
  const r = await fetcher("/api/drive/push-subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) return { ok: false, message: `Couldn't turn alerts on: ${d.error || `HTTP ${r.status}`}` };
  try { localStorage.setItem(ON_KEY, "1"); localStorage.setItem("hpd-push-reg", JSON.stringify({ endpoint: sub.toJSON().endpoint, at: Date.now() })); } catch { /* private mode */ }
  return { ok: true, message: "🔔 Phone alerts are on: wins (cha-ching), notices, requests, rejections, messages, new invitations and deadlines — even with the app closed (checked every 10 minutes)." };
}

export async function turnOffPush(fetcher: typeof fetch = fetch) {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetcher("/api/drive/push-subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName(), off: true }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* nothing to undo */ }
  try { localStorage.removeItem(ON_KEY); } catch { /* private mode */ }
}

// A test alert shown by this phone right away (proves the permission and the look; real ones come from the server).
export async function testAlert() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return false;
  await reg.showNotification("HPD Field · test alert", { body: "Phone alerts work. HPD replies, new invitations and notices running out of time will show like this.", icon: "/icons/icon-192.png", tag: "hpd-test" });
  return true;
}

// Automatic (21 Oct: "this has to be automatic, I shouldn't have to turn it on"): whenever the app opens and the iPhone
// already allows alerts, this phone (re)registers itself -- no tap, no sign-in. Once a day at most (or when the push
// address changed), so the status server isn't written on every open.
const REG_KEY = "hpd-push-reg";
export async function autoRegisterPush(fetcher: typeof fetch = fetch): Promise<"registered" | "fresh" | "needs-allow" | "unsupported" | "failed"> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "granted") return Notification.permission === "default" ? "needs-allow" : "unsupported";
  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) }));
    const json = sub.toJSON();
    let last: { endpoint?: string; at?: number } = {};
    try { last = JSON.parse(localStorage.getItem(REG_KEY) || "{}"); } catch { /* none */ }
    // Registered today AND the server really has this phone: nothing to do. Otherwise register again (21 Oct: the phone
    // said "On" but the server never got it).
    if (last.endpoint === json.endpoint && Date.now() - (last.at || 0) < 86400000 && (await serverHasPhone(String(json.endpoint), fetcher)) !== false) { try { localStorage.setItem(ON_KEY, "1"); } catch { /* private mode */ } return "fresh"; }
    const r = await fetcher("/api/drive/push-subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: json, device: deviceName() }) });
    if (!r.ok) return "failed";
    try { localStorage.setItem(REG_KEY, JSON.stringify({ endpoint: json.endpoint, at: Date.now() })); localStorage.setItem(ON_KEY, "1"); } catch { /* private mode */ }
    return "registered";
  } catch { return "failed"; }
}

// Does the status server have this phone (by its id: the first 8 bytes of SHA-256 of the push address)? null: can't tell.
export async function serverHasPhone(endpoint: string, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
    const id = `PUSH-${[...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const r = await fetcher(`https://hpd-status-worker.uac525.workers.dev/push-subs?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const subs = (await r.json()).subs || {};
    return !!subs[id] && !subs[id].off;
  } catch { return null; }
}
export async function thisPhoneOnServer(fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? await serverHasPhone(sub.endpoint, fetcher) : false;
  } catch { return null; }
}
