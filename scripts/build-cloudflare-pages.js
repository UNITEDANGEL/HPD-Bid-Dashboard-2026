const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const tempRoot = path.join(root, ".cloudflare-build");
const tempApiDir = path.join(tempRoot, "app-api");
const outDir = path.join(root, "out");

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
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
  path.join(outDir, "fetcher", "index.html"),
  path.join(outDir, "data", "COA_Fetcher_2026.json"),
  path.join(outDir, "data", "fetcher_latest_status.json"),
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));

if (missing.length) {
  throw new Error(`Cloudflare Pages build is missing expected output: ${missing.join(", ")}`);
}

console.log("Cloudflare Pages static export ready in out/");
