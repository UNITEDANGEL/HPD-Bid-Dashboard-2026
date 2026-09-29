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
assert.deepEqual(await status.json(), { configured: true, connected: true, email: identity.email, verifiedAt: null, syncEnabled: false });
assert.equal((await handleDriveAuth(request("check", "POST", ""), env, noNetwork)).status, 401);
assert.equal((await handleDriveAuth(request("check", "GET", sessionCookie), env, noNetwork)).status, 405);
assert.equal((await handleDriveAuth(request("check", "POST", sessionCookie, "https://evil.test"), env, noNetwork)).status, 403);
for (const action of ["backup-id", "save-backup", "test-backup"]) {
  assert.equal((await handleDriveAuth(request(action, "POST"), env, noNetwork)).status, 401);
  assert.equal((await handleDriveAuth(request(action, "GET", sessionCookie), env, noNetwork)).status, 405);
  assert.equal((await handleDriveAuth(request(action, "POST", sessionCookie, "https://evil.test"), env, noNetwork)).status, 403);
}
for (const action of ["backups", "backup"]) {
  assert.equal((await handleDriveAuth(request(action), env, noNetwork)).status, 401);
}
const beforeRefresh = [...records.values()][0];
const outage = await handleDriveAuth(request("check", "POST", sessionCookie), env, async () => Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
assert.equal(outage.status, 503);
assert.equal([...records.values()][0], beforeRefresh);
let refreshCount = 0;
const refreshMock = async (url, options) => {
  if (url === "https://oauth2.googleapis.com/token") {
    assert.equal(options.body.get("grant_type"), "refresh_token");
    assert.equal(options.body.get("refresh_token"), "private-refresh");
    refreshCount++;
    return Response.json({ access_token: "renewed-access" });
  }
  assert.equal(options.headers.Authorization, "Bearer renewed-access");
  if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json(identity);
  assert.equal(url, "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)");
  return Response.json({ user: { emailAddress: identity.email } });
};
const renew = await handleDriveAuth(request("check", "POST", sessionCookie), env, refreshMock);
assert.equal(renew.status, 200);
assert.match(renew.headers.get("Set-Cookie"), /Max-Age=2592000/);
const renewedBody = await renew.text();
assert.ok(!renewedBody.includes("renewed-access"));
assert.equal(JSON.parse(renewedBody).connected, true);
assert.ok(JSON.parse(renewedBody).verifiedAt);
assert.equal((await handleDriveAuth(request("check", "POST", sessionCookie), env, refreshMock)).status, 200);
assert.equal(refreshCount, 2, "Refresh token retained when Google omits replacement");
const allocated = await handleDriveAuth(request("backup-id", "POST", sessionCookie), env, async (url, options) =>
  url.includes("generateIds") ? Response.json({ ids: ["synthetic_file_id_001"] }) : refreshMock(url, options));
assert.equal(allocated.status, 200);
assert.equal((await allocated.json()).id, "synthetic_file_id_001");
assert.equal(allocated.headers.get("Set-Cookie"), null, "Recent backup operations avoid redundant KV writes");
const lastGood = [...records.values()][0];
const driveDenied = await handleDriveAuth(request("check", "POST", sessionCookie), env, async (url, options) =>
  url.includes("/drive/v3/about") ? Response.json({ error: "api_unavailable" }, { status: 403 }) : refreshMock(url, options));
assert.equal(driveDenied.status, 503);
assert.equal([...records.values()][0], lastGood, "Unavailable Drive API preserves credential");
const wrongRenewedAccount = await handleDriveAuth(request("check", "POST", sessionCookie), env, async (url, options) =>
  url.includes("/userinfo") ? Response.json({ ...identity, sub: "someone-else" }) : refreshMock(url, options));
assert.equal(wrongRenewedAccount.status, 403);
assert.equal([...records.values()][0], lastGood);
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
const revokedLogin = await callback(await begin(), googleMock());
const revokedCookie = revokedLogin.headers.getSetCookie().find((v) => v.startsWith("__Host-hpd-drive-session=")).split(";")[0];
const revoked = await handleDriveAuth(request("check", "POST", revokedCookie), env, async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
assert.equal(revoked.status, 401);
assert.equal((await revoked.json()).reconnectRequired, true);
assert.equal(records.size, 0);
console.log("PASS renewal: refresh-token reuse, live Drive identity check, no token exposure, sliding cookie, transient preservation, revoked access.");
console.log("PASS Drive auth: fail-closed config, methods/origin, PKCE, state/tamper/expiry, denied/wrong account/scope, encrypted session, expiry and disconnect. No real accounts or files changed.");
