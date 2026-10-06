import { handleDriveBackups } from "./drive-backups.mjs";
import { handleDrivePackages } from "./drive-packages.mjs";
import { handleDriveVideos } from "./drive-videos.mjs";
const BACKUP_ACTIONS = ["backups", "backup", "backup-id", "save-backup", "test-backup"];
const PACKAGE_ACTIONS = ["package-folder", "package-file", "email-package"];
const VIDEO_ACTIONS = ["video-start", "video-piece", "video-to-package"];
const SCOPE = "https://www.googleapis.com/auth/drive.file";
// Sends approved packages from the owner's Gmail. Optional: Drive works if it is not granted.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
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

// All private file operations pass the same owner/session/Google identity checks.
export async function handleDriveAuth(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const action = url.pathname.replace(/\/$/, "").split("/").pop();
  const cfg = config(env);
  if (!cfg) return json({ configured: false, connected: false, syncEnabled: false, error: "Drive connection setup is pending." }, action === "session" ? 200 : 503);
  if (url.origin !== cfg.origin) return json({ error: "Origin not allowed." }, 403);
  if (!["session", "start", "callback", "disconnect", "check", ...BACKUP_ACTIONS, ...PACKAGE_ACTIONS, ...VIDEO_ACTIONS].includes(action)) return json({ error: "Not found." }, 404);
  const method = ["start", "disconnect", "check", "backup-id", "save-backup", "test-backup", ...PACKAGE_ACTIONS, ...VIDEO_ACTIONS].includes(action) ? "POST" : "GET";
  if (request.method !== method) return json({ error: "Method not allowed." }, 405);
  if (method === "POST" && request.headers.get("Origin") !== cfg.origin) return json({ error: "Origin not allowed." }, 403);
  try {
    if (action === "session") {
      const saved = await session(request, env, cfg);
      return json({ configured: true, connected: Boolean(saved), email: saved?.email || null, verifiedAt: saved?.verifiedAt || null, canEmail: Boolean(saved?.canEmail), syncEnabled: false });
    }
    if (action === "check" || BACKUP_ACTIONS.includes(action) || PACKAGE_ACTIONS.includes(action) || VIDEO_ACTIONS.includes(action)) {
      const saved = await session(request, env, cfg);
      if (!saved) return json({ reconnectRequired: true, error: "Sign in to Google Drive again." }, 401);
      const renewed = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.HPD_DRIVE_CLIENT_ID, client_secret: env.HPD_DRIVE_CLIENT_SECRET,
          refresh_token: saved.refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(15000),
      });
      const token = await renewed.json();
      if (!renewed.ok) {
        if (token.error === "invalid_grant") {
          await env.HPD_DRIVE_SESSIONS.delete(`session:${saved.id}`);
          const response = json({ reconnectRequired: true, error: "Google revoked or expired access (invalid_grant). Reconnect Google Drive." }, 401);
          response.headers.append("Set-Cookie", cookie(SESSION, "", 0));
          return response;
        }
        return json({ error: "Google access renewal failed. Your saved connection and local records were kept." }, 503);
      }
      if (!token.access_token) return json({ error: "Google did not return renewed access. Try again later." }, 503);
      const authHeaders = { Authorization: `Bearer ${token.access_token}` };
      const identityResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", { headers: authHeaders, signal: AbortSignal.timeout(15000) });
      if (!identityResponse.ok) return json({ error: "Could not verify the renewed Google connection." }, 503);
      const identity = await identityResponse.json();
      if (identity.sub !== saved.sub || identity.email_verified !== true || identity.email?.toLowerCase() !== cfg.email) {
        return json({ error: "Renewed Google identity did not match the approved account." }, 403);
      }
      const driveResponse = await fetcher("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: authHeaders, signal: AbortSignal.timeout(15000) });
      if (!driveResponse.ok) return json({ error: `Google Drive access check failed (HTTP ${driveResponse.status}). Connection kept; check API availability and permission.` }, 503);
      const drive = await driveResponse.json();
      if (drive.user?.emailAddress?.toLowerCase() !== cfg.email) return json({ error: "Google Drive account did not match." }, 403);
      const verifiedAt = new Date().toISOString();
      const { id, ...previous } = saved;
      // Google reports the granted scopes on refresh; keep "can send email" accurate.
      const canEmail = token.scope ? String(token.scope).split(" ").includes(GMAIL_SCOPE) : Boolean(saved.canEmail);
      const value = { ...previous, refreshToken: token.refresh_token || saved.refreshToken, canEmail, verifiedAt, expires: Date.now() + TTL * 1000 };
      const renewSession = action === "check" || Boolean(token.refresh_token) || canEmail !== Boolean(saved.canEmail) || !saved.verifiedAt
        || Date.now() - Date.parse(saved.verifiedAt) >= 6 * 3600000;
      if (renewSession) await env.HPD_DRIVE_SESSIONS.put(`session:${id}`, await seal(env, value, `session:${id}`), { expirationTtl: TTL });
      const response = BACKUP_ACTIONS.includes(action)
        ? await handleDriveBackups(request, action, authHeaders, fetcher)
        : PACKAGE_ACTIONS.includes(action)
          ? await handleDrivePackages(request, action, authHeaders, fetcher, env, cfg.email)
          : VIDEO_ACTIONS.includes(action)
            ? await handleDriveVideos(request, action, authHeaders, fetcher)
            : json({ configured: true, connected: true, email: cfg.email, verifiedAt, canEmail, syncEnabled: false });
      if (renewSession) response.headers.append("Set-Cookie", cookie(SESSION, id, TTL));
      return response;
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
        response_type: "code", scope: `openid email ${SCOPE} ${GMAIL_SCOPE}`, state, code_challenge: challenge,
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
    const canEmail = String(token.scope || "").split(" ").includes(GMAIL_SCOPE);
    const value = { email: cfg.email, sub: identity.sub, refreshToken: token.refresh_token, canEmail, expires: Date.now() + TTL * 1000 };
    await env.HPD_DRIVE_SESSIONS.put(`session:${id}`, await seal(env, value, `session:${id}`), { expirationTtl: TTL });
    return redirect(`${cfg.origin}/storage/`, [cookie(FLOW, "", 0), cookie(SESSION, id, TTL)]);
  } catch {
    // Never return OAuth responses, credentials or storage errors to the client.
    return json({ connected: false, syncEnabled: false, error: "Drive connection failed. Your local records are unchanged." }, 503);
  }
}
