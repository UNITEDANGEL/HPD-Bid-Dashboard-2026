const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const tempRoot = path.join(root, ".cloudflare-build");
const tempApiDir = path.join(tempRoot, "app-api");
const outDir = path.join(root, "out");
const outDataDir = path.join(outDir, "data");
const generatedNextTypeDirs = [
  path.join(root, ".next", "dev", "types"),
  path.join(root, ".next", "types"),
];

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function readJsonIfExists(target) {
  if (!fs.existsSync(target)) return null;

  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

function currentCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;

  const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });

  if (result.status === 0) return result.stdout.trim();
  return "local";
}

function moveIfExists(from, to) {
  if (fs.existsSync(from)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return true;
  }

  return false;
}

function restoreApiRouteDirectory(moved) {
  if (!moved) return;

  if (fs.existsSync(apiDir)) {
    throw new Error("Cannot restore app/api because a new app/api directory already exists.");
  }

  fs.renameSync(tempApiDir, apiDir);
}

let movedApi = false;

try {
  removeIfExists(outDir);
  removeIfExists(tempRoot);
  generatedNextTypeDirs.forEach(removeIfExists);

  // Next static export cannot include dynamic app/api route handlers.
  // Cloudflare serves the matching runtime API from the Pages Functions directory.
  movedApi = moveIfExists(apiDir, tempApiDir);

  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      CLOUDFLARE_STATIC_EXPORT: "1",
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Cloudflare Pages build failed with exit code ${result.status}.`);
  }
} finally {
  restoreApiRouteDirectory(movedApi);
  removeIfExists(tempRoot);
}

const requiredFiles = [
  path.join(outDir, "index.html"),
  path.join(outDir, "map", "index.html"),
  path.join(outDir, "paperwork", "index.html"),
  path.join(outDir, "fetcher", "index.html"),
  path.join(outDir, "data", "COA_Fetcher_2026.json"),
  path.join(outDir, "data", "fetcher_latest_status.json"),
  path.join(outDir, "templates", "work-completed-affidavit.pdf"),
  path.join(outDir, "templates", "no-work-completed-affidavit.pdf"),
  path.join(outDir, "templates", "blank-work-completed-affidavit-with-invoice.pdf"),
  path.join(outDir, "templates", "blank-no-work-completed-affidavit-with-invoice.pdf"),
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));

if (missing.length) {
  throw new Error(`Cloudflare Pages build is missing expected output: ${missing.join(", ")}`);
}

fs.writeFileSync(
  path.join(outDataDir, "build_health.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      commit: currentCommit(),
      status: readJsonIfExists(path.join(outDataDir, "fetcher_latest_status.json")),
    },
    null,
    2
  ),
  "utf8"
);

console.log("Cloudflare Pages static export ready in out/");
