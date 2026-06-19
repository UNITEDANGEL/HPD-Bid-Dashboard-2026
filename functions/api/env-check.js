function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
export async function onRequestGet(context) {
  return json({
    ok: true,
    env: {
      GITHUB_ACTIONS_PAT: Boolean(context.env.GITHUB_ACTIONS_PAT),
      GITHUB_TOKEN_PAT: Boolean(context.env.GITHUB_TOKEN_PAT),
      GITHUB_PAT: Boolean(context.env.GITHUB_PAT),
      GITHUB_TOKEN: Boolean(context.env.GITHUB_TOKEN),
      GH_TOKEN: Boolean(context.env.GH_TOKEN),
      GITHUB_REPOSITORY_FULL_NAME: Boolean(context.env.GITHUB_REPOSITORY_FULL_NAME),
      GITHUB_FETCHER_WORKFLOW: Boolean(context.env.GITHUB_FETCHER_WORKFLOW),
      GITHUB_FETCHER_BRANCH: Boolean(context.env.GITHUB_FETCHER_BRANCH)
    }
  });
}
