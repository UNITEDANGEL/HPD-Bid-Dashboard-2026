function textResponse(message, status = 503) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
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

  if (context.env.AUTOMATION_WORKER_TOKEN) {
    headers.set("Authorization", `Bearer ${context.env.AUTOMATION_WORKER_TOKEN}`);
  }

  return headers;
}

function filePathFromParams(context) {
  const raw = context.params?.path || "";
  const path = Array.isArray(raw) ? raw.join("/") : raw;

  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export async function onRequestOptions() {
  return textResponse("ok", 200);
}

export async function onRequestGet(context) {
  const baseUrl = workerBase(context);
  if (!baseUrl) {
    return textResponse("Missing AUTOMATION_WORKER_URL environment variable.");
  }

  const filePath = filePathFromParams(context);
  if (!filePath) {
    return textResponse("Missing automation file path.", 400);
  }

  try {
    const response = await fetch(`${baseUrl}/files/${filePath}`, {
      headers: workerHeaders(context),
      cache: "no-store"
    });

    if (!response.ok) {
      return new Response(await response.text(), {
        status: response.status,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");

    for (const key of ["content-type", "content-disposition", "content-length"]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    return textResponse(error?.message || String(error));
  }
}

