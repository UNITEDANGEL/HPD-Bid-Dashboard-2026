function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
function cleanDays(value) {
  const raw = Number(value || 14);
  const safe = Number.isFinite(raw) ? Math.floor(raw) : 14;
  return Math.min(95, Math.max(1, safe));
}
export async function onRequestOptions() {
  return json({ ok: true });
}
export async function onRequestGet() {
  return json({
    ok: true,
    service: "hpd-cloudflare-fetcher-api"
  });
}
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const daysBack = cleanDays(body.days_back || body.daysBack || 14);
    const token =
      context.env.GITHUB_ACTIONS_PAT ||
      context.env.GITHUB_TOKEN_PAT ||
      context.env.GITHUB_PAT ||
      context.env.GITHUB_TOKEN ||
      context.env.GH_TOKEN ||
      "";
    if (!token) {
      return json(
        {
          ok: false,
          error: "Missing GitHub token in Cloudflare Pages variables. Add one of these in Production: GITHUB_ACTIONS_PAT, GITHUB_PAT, GITHUB_TOKEN_PAT, GITHUB_TOKEN, or GH_TOKEN."
        },
        500
      );
    }
    const repo =
      context.env.GITHUB_REPOSITORY_FULL_NAME ||
      "UNITEDANGEL/HPD-Bid-Dashboard-2026";
    const workflow =
      context.env.GITHUB_FETCHER_WORKFLOW ||
      "run-fetcher.yml";
    const branch =
      context.env.GITHUB_FETCHER_BRANCH ||
      "main";
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "HPD-Bid-Dashboard-Cloudflare-Pages"
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
      return json(
        {
          ok: false,
          error: `GitHub workflow dispatch failed with status ${response.status}.`,
          details
        },
        response.status
      );
    }
    return json({
      ok: true,
      message: "Fetcher workflow started from Cloudflare Pages.",
      days_back: daysBack,
      branch,
      workflow
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error && error.message ? error.message : String(error)
      },
      500
    );
  }
}


