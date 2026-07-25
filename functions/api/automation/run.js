function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
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
  headers.set("Content-Type", "application/json");

  if (context.env.AUTOMATION_WORKER_TOKEN) {
    headers.set("Authorization", `Bearer ${context.env.AUTOMATION_WORKER_TOKEN}`);
  }

  return headers;
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const baseUrl = workerBase(context);
  if (!baseUrl) {
    return json({ error: "Missing AUTOMATION_WORKER_URL environment variable." }, 503);
  }

  try {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: workerHeaders(context),
      body: await context.request.text(),
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

