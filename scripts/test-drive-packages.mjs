// Synthetic Google mocks only: no real Drive files or emails.
import assert from "node:assert/strict";
import { handleDrivePackages, packageRecipients } from "../server/drive-packages.mjs";

const owner = "owner@example.test";
const auth = { Authorization: "Bearer test-access" };
const req = (action, body, headers = {}) => new Request(`https://app.example.test/api/drive/${action}`, { method: "POST", headers, body });
const calls = [];
let rootExists = false;

const google = async (url, options = {}) => {
  calls.push({ url, method: options.method || "GET", headers: options.headers, body: options.body });
  assert.equal(options.headers.Authorization, "Bearer test-access");
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?q=")) {
    assert.match(decodeURIComponent(url), /hpd-packages-root/);
    return Response.json({ files: rootExists ? [{ id: "root_folder_0001" }] : [] });
  }
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink")) {
    const meta = JSON.parse(options.body);
    assert.equal(meta.mimeType, "application/vnd.google-apps.folder");
    if (meta.appProperties.hpdKind === "hpd-packages-root") return Response.json({ id: "root_folder_0001" });
    assert.deepEqual(meta.parents, ["root_folder_0001"]);
    assert.equal(meta.appProperties.hpdKind, "hpd-package-folder");
    return Response.json({ id: "package_folder_01", webViewLink: "https://drive.google.com/drive/folders/package_folder_01" });
  }
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) {
    const id = url.split("/files/")[1].split("?")[0];
    return Response.json({ id, mimeType: "application/vnd.google-apps.folder", ownedByMe: id !== "someone_elses_01", trashed: false,
      appProperties: { hpdKind: id === "not_package_001" ? "other" : "hpd-package-folder" } });
  }
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable")) {
    const meta = JSON.parse(options.body);
    assert.deepEqual(meta.parents, ["package_folder_01"]);
    assert.equal(meta.appProperties.hpdKind, "hpd-package-file");
    return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } });
  }
  if (url === "https://www.googleapis.com/upload/drive/v3/files?upload_id=test") return Response.json({ id: "uploaded_file_01" });
  if (url.startsWith("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send")) return Response.json({ id: "sent-message" });
  throw new Error(`Unexpected request ${url}`);
};

// Folder: creates the HPD Packages root once, then a folder per package.
let response = await handleDrivePackages(req("package-folder", JSON.stringify({ name: "ER05395_work-completed/../x" }), { "Content-Type": "application/json" }), "package-folder", auth, google, {}, owner);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { folderId: "package_folder_01", link: "https://drive.google.com/drive/folders/package_folder_01" });
const created = calls.filter((c) => c.url.includes("fields=id,webViewLink")).map((c) => JSON.parse(c.body));
assert.equal(created.length, 2);
assert.equal(created[1].name, "ER05395_work-completed-..-x", "Slashes cannot make nested paths");
rootExists = true; calls.length = 0;
await handleDrivePackages(req("package-folder", JSON.stringify({ name: "second" }), { "Content-Type": "application/json" }), "package-folder", auth, google, {}, owner);
assert.equal(calls.filter((c) => c.url.includes("fields=id,webViewLink")).length, 1, "Existing root is reused");

// File upload: only into this app's own package folders.
const pdf = new Uint8Array([37, 80, 68, 70]);
response = await handleDrivePackages(req("package-file", pdf, { "X-HPD-Folder": "package_folder_01", "X-HPD-Name": encodeURIComponent("ER05395 package.pdf"), "Content-Type": "application/pdf" }), "package-file", auth, google, {}, owner);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { id: "uploaded_file_01", name: "ER05395 package.pdf" });
const put = calls.at(-1);
assert.equal(put.method, "PUT");
assert.deepEqual([...put.body], [...pdf]);
for (const folder of ["someone_elses_01", "not_package_001"]) {
  response = await handleDrivePackages(req("package-file", pdf, { "X-HPD-Folder": folder, "X-HPD-Name": "a.pdf", "Content-Type": "application/pdf" }), "package-file", auth, google, {}, owner);
  assert.equal(response.status, 403, folder);
}
response = await handleDrivePackages(req("package-file", pdf, { "X-HPD-Folder": "../../etc", "Content-Type": "application/pdf" }), "package-file", auth, google, {}, owner);
assert.equal(response.status, 400);
response = await handleDrivePackages(req("package-file", new Uint8Array(), { "X-HPD-Folder": "package_folder_01", "X-HPD-Name": "a.pdf", "Content-Type": "application/pdf" }), "package-file", auth, google, {}, owner);
assert.equal(response.status, 400);

// Email: server sets From/To/Subject; the browser cannot pick recipients.
const boundary = "hpd_test_boundary_0001";
const parts = `--${boundary}\r\nContent-Type: text/plain\r\n\r\nPackage ER05395\r\n--${boundary}--\r\n`;
response = await handleDrivePackages(req("email-package", parts, { "Content-Type": "text/plain", "X-HPD-Boundary": boundary, "X-HPD-Subject": encodeURIComponent("ER05395 – Work Completed"), To: "attacker@example.test" }), "email-package", auth, google, {}, owner);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { sent: true, to: [owner] });
const message = new TextDecoder().decode(calls.at(-1).body);
assert.match(message, /^From: owner@example\.test\r\nTo: owner@example\.test\r\nSubject: =\?UTF-8\?B\?/);
assert.ok(!message.includes("attacker"));
assert.match(message, new RegExp(`boundary="${boundary}"[\\s\\S]*Package ER05395`));
response = await handleDrivePackages(req("email-package", parts, { "Content-Type": "text/plain", "X-HPD-Boundary": "bad\"; Bcc=x@y.z" }), "email-package", auth, google, {}, owner);
assert.equal(response.status, 400, "Header injection through boundary is rejected");
assert.deepEqual(packageRecipients({ HPD_PACKAGE_EMAIL_TO: "Office@Example.test, owner@example.test" }, owner), ["office@example.test", "owner@example.test"]);
assert.throws(() => packageRecipients({ HPD_PACKAGE_EMAIL_TO: "not an email" }, owner));
const denied = async (url, options) => url.includes("gmail") ? new Response("{}", { status: 403 }) : google(url, options);
response = await handleDrivePackages(req("email-package", parts, { "Content-Type": "text/plain", "X-HPD-Boundary": boundary }), "email-package", auth, denied, {}, owner);
assert.equal(response.status, 403);
assert.match((await response.json()).error, /Reconnect Google/);

console.log("PASS Drive packages: per-package folders, owned-folder uploads, server-set email recipients, header injection and Gmail permission errors.");
