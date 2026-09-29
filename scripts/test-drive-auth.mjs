import assert from "node:assert/strict";
import { handleDriveAuth } from "../server/drive-auth.mjs";

const origin = "https://app.example.test";
const records = new Map();
const env = { HPD_DRIVE_APP_ORIGIN: origin, HPD_DRIVE_ALLOWED_EMAIL: "owner@example.test",
  HPD_DRIVE_CLIENT_ID: "test-client", HPD_DRIVE_CLIENT_SECRET: "test-secret",
  HPD_DRIVE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
  HPD_DRIVE_SESSIONS: { get: async (id) => records.get(id), put: async (id, value) => records.set(id, value), delete: async (id) => records.delete(id) } };
function request(action, method = "GET", cookies = "", requestOrigin = origin) {
  return new Request(`${origin}/api/drive/${action}`, { method, headers: { Origin: requestOrigin, Cookie: cookies } });
}
const noNetwork = () => { throw new Error("Unexpected network"); };
assert.deepEqual(await (await handleDriveAuth(request("session"), {}, noNetwork)).json(), {
  configured: false, connected: false, syncEnabled: false, error: "Drive connection setup is pending.",
});
assert.equal((await handleDriveAuth(request("start", "GET"), env)).status, 405);
assert.equal((await handleDriveAuth(request("start", "POST", "", "https://evil.test"), env)).status, 403);
assert.equal((await handleDriveAuth(request("session"), { ...env, HPD_DRIVE_ENCRYPTION_KEY: "invalid" })).status, 200);

async function begin() {
  const response = await handleDriveAuth(request("start", "POST"), env, noNetwork);
  assert.equal(response.status, 303);
  const auth = new URL(response.headers.get("Location"));
  assert.equal(auth.origin, "https://accounts.google.com");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/drive.file");
  assert.equal(auth.searchParams.get("redirect_uri"), `${origin}/api/drive/callback`);
  const fullCookie = response.headers.getSetCookie()[0];
  assert.match(fullCookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!fullCookie.includes("verifier"));
  return { state: auth.searchParams.get("state"), cookie: fullCookie.split(";")[0] };
}
async function callback(flow, fetcher, extra = "code=synthetic-code") {
  return handleDriveAuth(request(`callback?state=${flow.state}&${extra}`, "GET", flow.cookie), env, fetcher);
}
const identity = { sub: "test-owner", email: "owner@example.test", email_verified: true };
function googleMock(user = identity, scope = "https://www.googleapis.com/auth/drive.file", failToken = false) {
  return async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      assert.equal(options.body.get("grant_type"), "authorization_code");
      assert.match(options.body.get("code_verifier"), /^[\w-]{43}$/);
      return Response.json({ access_token: "private-access", refresh_token: "private-refresh", scope }, { status: failToken ? 400 : 200 });
    }
    assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
    assert.equal(options.headers.Authorization, "Bearer private-access");
    return Response.json(user);
  };
}
let flow = await begin();
assert.match((await callback({ ...flow, state: "wrong" }, noNetwork)).headers.get("Location"), /invalid_state/);
assert.match((await callback({ ...flow, cookie: flow.cookie + "tamper" }, noNetwork)).headers.get("Location"), /invalid_state/);
assert.match((await callback(flow, noNetwork, "error=access_denied")).headers.get("Location"), /denied/);
assert.match((await callback(flow, googleMock({ ...identity, email: "other@example.test" }))).headers.get("Location"), /wrong_account/);
assert.match((await callback(flow, googleMock({ ...identity, email_verified: false }))).headers.get("Location"), /wrong_account/);
assert.match((await callback(flow, googleMock(identity, "openid email"))).headers.get("Location"), /permission_missing/);
assert.match((await callback(flow, googleMock(identity, undefined, true))).headers.get("Location"), /exchange_failed/);
assert.equal(records.size, 0);
const now = Date.now;
Date.now = () => now() + 601000;
assert.match((await callback(flow, noNetwork)).headers.get("Location"), /invalid_state/);
Date.now = now;
const success = await callback(await begin(), googleMock());
assert.equal(success.headers.get("Location"), `${origin}/storage/`);
assert.equal(records.size, 1);
const sessionCookie = success.headers.getSetCookie().find((v) => v.startsWith("__Host-hpd-drive-session=")).split(";")[0];
assert.ok(!sessionCookie.includes("private-refresh"));
assert.ok(![...records.values()][0].includes("private-refresh"));
const status = await handleDriveAuth(request("session", "GET", sessionCookie), env, noNetwork);
assert.equal(status.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await status.json(), { configured: true, connected: true, email: identity.email, syncEnabled: false });
Date.now = () => now() + 31 * 86400000;
assert.equal((await (await handleDriveAuth(request("session", "GET", sessionCookie), env)).json()).connected, false);
Date.now = now;
assert.equal((await handleDriveAuth(request("disconnect", "POST", sessionCookie, "https://evil.test"), env)).status, 403);
assert.equal(records.size, 1);
assert.equal((await handleDriveAuth(request("disconnect", "POST", sessionCookie), env)).status, 303);
assert.equal(records.size, 0);
assert.equal((await (await handleDriveAuth(request("session", "GET", sessionCookie), env)).json()).connected, false);
assert.equal((await handleDriveAuth(new Request("https://evil.test/api/drive/session"), env)).status, 403);
const brokenEnv = { ...env, HPD_DRIVE_SESSIONS: { get: async () => { throw new Error("private-storage-details"); } } };
const failure = await handleDriveAuth(request("session", "GET", sessionCookie), brokenEnv);
assert.equal(failure.status, 503);
assert.ok(!(await failure.text()).includes("private-storage-details"));
console.log("PASS Drive auth: fail-closed config, methods/origin, PKCE, state/tamper/expiry, denied/wrong account/scope, encrypted session, expiry and disconnect. No real accounts or files changed.");
