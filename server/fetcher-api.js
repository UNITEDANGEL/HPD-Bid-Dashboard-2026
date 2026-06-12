const http = require("http");
const PORT = Number(process.env.PORT || 8788);
function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}
function cleanDays(value) {
  const raw = Number(value || 14);
  const safe = Number.isFinite(raw) ? Math.floor(raw) : 14;
  return Math.min(95, Math.max(1, safe));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "hpd-fetcher-api"
    });
  }
  if (req.method === "POST" && req.url === "/api/run-fetcher") {
    try {
      const body = await readBody(req);
      const daysBack = cleanDays(body.days_back || body.daysBack || 14);
      const token = process.env.GITHUB_ACTIONS_PAT || process.env.GITHUB_TOKEN_PAT || "";
      if (!token) {
        return sendJson(res, 500, {
          ok: false,
          error: "Missing GITHUB_ACTIONS_PAT on Render fetcher API service."
        });
      }
      const repo = process.env.GITHUB_REPOSITORY_FULL_NAME || "UNITEDANGEL/HPD-Bid-Dashboard-2026";
      const workflow = process.env.GITHUB_FETCHER_WORKFLOW || "run-fetcher.yml";
      const branch = process.env.GITHUB_FETCHER_BRANCH || "render-map-upgrade";
      const response = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "HPD-Bid-Dashboard-Fetcher-API"
          },
          body: JSON.stringify({
            ref: branch,
            inputs: {
              days_back: String(daysBack)
            }
          })
        }
      );
      if (!response.ok) {
        const details = await response.text();
        return sendJson(res, response.status, {
          ok: false,
          error: `GitHub workflow dispatch failed with status ${response.status}.`,
          details
        });
      }
      return sendJson(res, 200, {
        ok: true,
        message: "Fetcher workflow started.",
        days_back: daysBack,
        branch,
        workflow
      });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }
  }
  return sendJson(res, 404, {
    ok: false,
    error: "Not found"
  });
});
server.listen(PORT, () => {
  console.log(`HPD fetcher API listening on port ${PORT}`);
});
