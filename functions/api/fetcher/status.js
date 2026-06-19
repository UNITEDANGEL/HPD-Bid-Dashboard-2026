function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

async function fetchText(url) {
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return "";
  return response.text();
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const statusUrl = new URL("/data/fetcher_latest_status.json", url);
  const logUrl = new URL("/data/fetcher_latest_run.log", url);

  let status = {
    state: "never_run",
    ok: false,
    error: "",
    summary: {}
  };

  try {
    const [statusText, logText] = await Promise.all([
      fetchText(statusUrl),
      fetchText(logUrl)
    ]);

    if (statusText) {
      status = JSON.parse(statusText);
    }

    return json({
      ...status,
      logPath: status.logPath || "data/fetcher_latest_run.log",
      logTail: logText ? logText.split(/\r?\n/).slice(-100).join("\n") : "",
      environment: {
        deployment: "cloudflare-pages",
        hasGitHubDispatchToken: Boolean(
          context.env.GITHUB_ACTIONS_PAT ||
            context.env.GITHUB_TOKEN_PAT ||
            context.env.GITHUB_PAT ||
            context.env.GITHUB_TOKEN ||
            context.env.GH_TOKEN
        )
      }
    });
  } catch (error) {
    return json(
      {
        ...status,
        state: "status_load_error",
        error: error && error.message ? error.message : String(error),
        logTail: "",
        environment: {
          deployment: "cloudflare-pages",
          hasGitHubDispatchToken: Boolean(
            context.env.GITHUB_ACTIONS_PAT ||
              context.env.GITHUB_TOKEN_PAT ||
              context.env.GITHUB_PAT ||
              context.env.GITHUB_TOKEN ||
              context.env.GH_TOKEN
          )
        }
      },
      500
    );
  }
}
