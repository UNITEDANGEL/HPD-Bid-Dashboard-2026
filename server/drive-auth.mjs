const SCOPE = "https://www.googleapis.com/auth/drive.file";
const SESSION = "__Host-hpd-drive-session";
const FLOW = "__Host-hpd-drive-flow";
const TTL = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const readCookie = (request, name) => (request.headers.get("Cookie") || "").split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
function redirect(url, cookies = []) {
  const result = new Headers({ ...headers, Location: url });
  for (const value of cookies) result.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers: result });
}
function config(env) {
  try {
    const origin = new URL(env.HPD_DRIVE_APP_ORIGIN);
    if (origin.protocol !== "https:" || origin.origin !== env.HPD_DRIVE_APP_ORIGIN) return null;
    if (!env.HPD_DRIVE_CLIENT_ID || !env.HPD_DRIVE_CLIENT_SECRET || !env.HPD_DRIVE_ALLOWED_EMAIL
      || !env.HPD_DRIVE_SESSIONS || decode(env.HPD_DRIVE_ENCRYPTION_KEY).length !== 32) return null;
    return { origin: origin.origin, email: env.HPD_DRIVE_ALLOWED_EMAIL.toLowerCase(), callback: `${origin.origin}/api/drive/callback` };
  } catch { return null; }
}
async function key(env) {
  return crypto.subtle.importKey("raw", decode(env.HPD_DRIVE_ENCRYPTION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, value, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(purpose) }, await key(env), encoder.encode(JSON.stringify(value)));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
async function unseal(env, value, purpose) {
  try {
    const [iv, data] = value.split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: encoder.encode(purpose) }, await key(env), decode(data));
    const result = JSON.parse(decoder.decode(plain));
    return result.expires > Date.now() ? result : null;
  } catch { return null; }
}
async function session(request, env, cfg) {
  const id = readCookie(request, SESSION);
  if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const stored = await env.HPD_DRIVE_SESSIONS.get(`session:${id}`);
  const value = stored && await unseal(env, stored, `session:${id}`);
  return value?.email === cfg.email ? { ...value, id } : null;
}

// This handler establishes authorization only. It never imports or writes job data.
export async function handleDriveAuth(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const action = url.pathname.replace(/\/$/, "").split("/").pop();
  const cfg = config(env);
  if (!cfg) return json({ configured: false, connected: false, syncEnabled: false, error: "Drive connection setup is pending." }, action === "session" ? 200 : 503);
  if (url.origin !== cfg.origin) return json({ error: "Origin not allowed." }, 403);
  if (!["session", "start", "callback", "disconnect"].includes(action)) return json({ error: "Not found." }, 404);
  const method = action === "start" || action === "disconnect" ? "POST" : "GET";
  if (request.method !== method) return json({ error: "Method not allowed." }, 405);
  if (method === "POST" && request.headers.get("Origin") !== cfg.origin) return json({ error: "Origin not allowed." }, 403);
  try {
    if (action === "session") {
      const saved = await session(request, env, cfg);
      return json({ configured: true, connected: Boolean(saved), email: saved?.email || null, syncEnabled: false });
    }
    if (action === "disconnect") {
      const saved = await session(request, env, cfg);
      if (saved) await env.HPD_DRIVE_SESSIONS.delete(`session:${saved.id}`);
      return redirect(`${cfg.origin}/storage/`, [cookie(SESSION, "", 0)]);
    }
    if (action === "start") {
      const state = random();
      const verifier = random();
      const flow = await seal(env, { state, verifier, expires: Date.now() + 600000 }, "oauth-flow");
      const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({ client_id: env.HPD_DRIVE_CLIENT_ID, redirect_uri: cfg.callback,
        response_type: "code", scope: `openid email ${SCOPE}`, state, code_challenge: challenge,
        code_challenge_method: "S256", access_type: "offline", prompt: "consent", login_hint: cfg.email }).toString();
      return redirect(auth.href, [cookie(FLOW, flow, 600)]);
    }
    const flow = await unseal(env, readCookie(request, FLOW) || "", "oauth-flow");
    const fail = (reason) => redirect(`${cfg.origin}/storage/?error=${reason}`, [cookie(FLOW, "", 0)]);
    if (!flow || !url.searchParams.get("state") || flow.state !== url.searchParams.get("state")) return fail("invalid_state");
    if (url.searchParams.has("error")) return fail("denied");
    const code = url.searchParams.get("code");
    if (!code) return fail("missing_code");
    const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.HPD_DRIVE_CLIENT_ID, client_secret: env.HPD_DRIVE_CLIENT_SECRET,
        redirect_uri: cfg.callback, grant_type: "authorization_code", code_verifier: flow.verifier }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok) return fail("exchange_failed");
    const token = await tokenResponse.json();
    if (!token.access_token || !token.refresh_token || !String(token.scope || "").split(" ").includes(SCOPE)) return fail("permission_missing");
    // User identity comes directly from Google over TLS, never a browser email header.
    const identityResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000),
    });
    if (!identityResponse.ok) return fail("identity_failed");
    const identity = await identityResponse.json();
    if (!identity.sub || identity.email_verified !== true || identity.email?.toLowerCase() !== cfg.email) return fail("wrong_account");
    const id = random();
    const value = { email: cfg.email, sub: identity.sub, refreshToken: token.refresh_token, expires: Date.now() + TTL * 1000 };
    await env.HPD_DRIVE_SESSIONS.put(`session:${id}`, await seal(env, value, `session:${id}`), { expirationTtl: TTL });
    return redirect(`${cfg.origin}/storage/`, [cookie(FLOW, "", 0), cookie(SESSION, id, TTL)]);
  } catch {
    // Never return OAuth responses, credentials or storage errors to the client.
    return json({ connected: false, syncEnabled: false, error: "Drive connection failed. Your local records are unchanged." }, 503);
  }
}
