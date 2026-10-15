// Private files the public site must not show in plain form (tenant names / phones): HPD's invitation
// PDFs and the tenant contact fields. The fetcher stores them encrypted (AES-GCM, key
// HPD_PRIVATE_DATA_KEY) under /private/...; this route decrypts them only for the signed-in owner.
//   GET /api/private/itb/<file>.pdf   -> the invitation PDF
//   GET /api/private/tenants          -> { "<OMO>": { TenantName, TenantPhone, ... } }
// File format: 12-byte IV followed by the AES-GCM ciphertext (scripts/private_data.py writes it).
import { signedInOwner } from "./drive-auth.mjs";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fromB64 = (s) => Uint8Array.from(atob(String(s || "").trim()), (c) => c.charCodeAt(0));

export async function decryptPrivate(bytes, keyB64) {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error("bad key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const data = new Uint8Array(bytes);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12)));
}

export async function handlePrivate(request, env, signedIn = signedInOwner) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: NO_STORE });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/private\/?/, "");
  let asset = "", type = "";
  const itb = /^itb\/([A-Za-z0-9_.-]+\.pdf)$/.exec(path);
  if (itb) { asset = `/private/itb/${itb[1]}.enc`; type = "application/pdf"; }
  else if (path === "tenants") { asset = "/private/tenants.json.enc"; type = "application/json"; }
  else return new Response("Not found", { status: 404, headers: NO_STORE });
  if (!env.HPD_PRIVATE_DATA_KEY) return new Response(JSON.stringify({ error: "Private data is not set up on the server." }), { status: 503, headers: { ...NO_STORE, "Content-Type": "application/json" } });
  if (!(await signedIn(request, env))) return new Response(JSON.stringify({ error: "Sign in with Google (Storage page) to see tenant details and invitation pages." }), { status: 401, headers: { ...NO_STORE, "Content-Type": "application/json" } });
  const res = await env.ASSETS.fetch(new URL(asset, url.origin));
  if (!res.ok) return new Response("Not found", { status: 404, headers: NO_STORE });
  try {
    const plain = await decryptPrivate(await res.arrayBuffer(), env.HPD_PRIVATE_DATA_KEY);
    return new Response(plain, { status: 200, headers: { ...NO_STORE, "Content-Type": type } });
  } catch {
    return new Response("Could not open the private file.", { status: 500, headers: NO_STORE });
  }
}
