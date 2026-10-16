// Read an HPD invitation PDF (or page picture) that the privacy step keeps encrypted: the plain copy on this
// computer (data/private-itb/), or decrypt public/private/<dir>/<name>.enc with HPD_PRIVATE_DATA_KEY.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export function privateKey() {
  const file = path.join(ROOT, "data/private/HPD_PRIVATE_DATA_KEY.txt");
  const k = Buffer.from((process.env.HPD_PRIVATE_DATA_KEY || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")).trim(), "base64");
  return k.length === 32 ? k : null;
}
export function readPrivateFile(dir, name) {
  for (const plain of [path.join(ROOT, "public", "documents", dir, name), path.join(ROOT, "data", "private-itb", dir, name)]) {
    if (fs.existsSync(plain)) return fs.readFileSync(plain);
  }
  const enc = path.join(ROOT, "public", "private", dir, `${name}.enc`);
  const k = privateKey();
  if (!k || !fs.existsSync(enc)) throw new Error(`${dir}/${name}: no plain copy and no key to open the encrypted one`);
  const buf = fs.readFileSync(enc);
  const d = crypto.createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}
