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

function isEmptyDirectory(target) {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory() && fs.readdirSync(target).length === 0;
  } catch {
    return false;
  }
}

function removeDirectoryContents(target) {
  for (const entry of fs.readdirSync(target)) {
    removeIfExists(path.join(target, entry), { allowEmptyDir: true });
  }
}

function removeIfExists(target, options = {}) {
  if (!fs.existsSync(target)) return;

  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    const canRetryDirectory =
      error &&
      error.code === "EPERM" &&
      fs.existsSync(target) &&
      fs.statSync(target).isDirectory();

    if (canRetryDirectory) {
      removeDirectoryContents(target);
      try {
        fs.rmdirSync(target);
        return;
      } catch {
        if (options.allowEmptyDir && isEmptyDirectory(target)) return;
      }
    }

    if (options.allowEmptyDir && isEmptyDirectory(target)) {
      return;
    }

    throw error;
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
    try {
      fs.renameSync(from, to);
    } catch (error) {
      if (!["EPERM", "EXDEV"].includes(error?.code)) throw error;

      fs.cpSync(from, to, { recursive: true });
      removeIfExists(from);
    }

    return true;
  }

  return false;
}

function copyRouteIfMissing(sourceRoute, targetRoute) {
  const source = path.join(outDir, sourceRoute, "index.html");
  const target = path.join(outDir, targetRoute, "index.html");
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function restoreApiRouteDirectory(moved) {
  if (!moved) return;

  if (fs.existsSync(apiDir)) {
    throw new Error("Cannot restore app/api because a new app/api directory already exists.");
  }

  try {
    fs.renameSync(tempApiDir, apiDir);
  } catch (error) {
    if (!["EPERM", "EXDEV"].includes(error?.code)) throw error;

    fs.cpSync(tempApiDir, apiDir, { recursive: true });
    removeIfExists(tempApiDir, { allowEmptyDir: true });
  }
}

function runPaperworkDataGate() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run verify:paperwork-data"] : ["run", "verify:paperwork-data"];
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Paperwork data quality gate failed with exit code ${result.status}.`);
  }
}

let movedApi = false;

try {
  runPaperworkDataGate();

  removeIfExists(outDir, { allowEmptyDir: true });
  removeIfExists(tempRoot, { allowEmptyDir: true });
  generatedNextTypeDirs.forEach((dir) => removeIfExists(dir, { allowEmptyDir: true }));

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
  removeIfExists(tempRoot, { allowEmptyDir: true });
}

copyRouteIfMissing("map", "field-command");

const requiredFiles = [
  path.join(outDir, "index.html"),
  path.join(outDir, "map", "index.html"),
  path.join(outDir, "field-command", "index.html"),
  path.join(outDir, "paperwork", "index.html"),
  path.join(outDir, "fetcher", "index.html"),
  path.join(outDir, "data", "COA_Fetcher_2026.json"),
  path.join(outDir, "data", "hpd_jobs_2026.txt"),
  path.join(outDir, "data", "fetcher_latest_status.json"),
  path.join(outDir, "templates", "work-performed-affidavit.pdf"),
  path.join(outDir, "templates", "no-work-performed-affidavit.pdf"),
  path.join(outDir, "templates", "invoice-page.pdf"),
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));

if (missing.length) {
  throw new Error(`Cloudflare Pages build is missing expected output: ${missing.join(", ")}`);
}

const cloudflareHeadersFile = path.join(root, "public", "_headers");
if (fs.existsSync(cloudflareHeadersFile)) {
  fs.copyFileSync(cloudflareHeadersFile, path.join(outDir, "_headers"));
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
