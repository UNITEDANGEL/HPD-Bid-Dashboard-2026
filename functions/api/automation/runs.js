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

function workerBase(context) {
  return context.env.AUTOMATION_WORKER_URL?.replace(/\/$/, "") || "";
}

function workerHeaders(context) {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (context.env.AUTOMATION_WORKER_TOKEN) {
    headers.set("Authorization", `Bearer ${context.env.AUTOMATION_WORKER_TOKEN}`);
  }

  return headers;
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet(context) {
  const baseUrl = workerBase(context);
  if (!baseUrl) {
    return json({ error: "Missing AUTOMATION_WORKER_URL environment variable." }, 503);
  }

  try {
    const url = new URL(context.request.url);
    const response = await fetch(`${baseUrl}/runs${url.search}`, {
      headers: workerHeaders(context),
      cache: "no-store"
    });
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 503);
  }
}

