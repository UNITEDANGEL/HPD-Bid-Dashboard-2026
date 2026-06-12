const express = require("express");
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8788;
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "fetcher-api" });
});
app.post("/api/run-fetcher", async (req, res) => {
  try {
    const allowedSecret = process.env.FETCHER_RUN_SECRET || "";
    const providedSecret = String(req.headers["x-fetcher-secret"] || "");
    if (allowedSecret && providedSecret !== allowedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized fetcher request." });
    }
    const daysBackRaw = Number(req.body?.days_back || req.body?.daysBack || 14);
    const daysBack = Math.min(95, Math.max(1, Math.floor(Number.isFinite(daysBackRaw) ? daysBackRaw : 14)));
    const repo = process.env.GITHUB_REPOSITORY_FULL_NAME || "UNITEDANGEL/HPD-Bid-Dashboard-2026";
    const workflow = process.env.GITHUB_FETCHER_WORKFLOW || "run-fetcher.yml";
    const branch = process.env.GITHUB_FETCHER_BRANCH || "render-map-upgrade";
    const token = process.env.GITHUB_ACTIONS_PAT || process.env.GITHUB_TOKEN_PAT || "";
    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "Missing GITHUB_ACTIONS_PAT environment variable on server."
      });
    }
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
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
    });
    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        ok: false,
        error: `GitHub dispatch failed: ${response.status}`,
        details: body
      });
    }
    return res.json({
      ok: true,
      message: "Fetcher workflow started.",
      days_back: daysBack,
      branch,
      workflow
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err)
    });
  }
});
app.listen(PORT, () => {
  console.log(`Fetcher API listening on port ${PORT}`);
});
