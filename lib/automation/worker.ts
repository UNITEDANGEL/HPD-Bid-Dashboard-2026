import { NextResponse } from "next/server";

function getWorkerBaseUrl() {
  return process.env.AUTOMATION_WORKER_URL?.replace(/\/$/, "") ?? "";
}

function buildHeaders(existing?: HeadersInit) {
  const headers = new Headers(existing);
  headers.set("Accept", "application/json");

  const workerToken = process.env.AUTOMATION_WORKER_TOKEN;
  if (workerToken) {
    headers.set("Authorization", `Bearer ${workerToken}`);
  }

  return headers;
}

async function fetchWorker(path: string, init: RequestInit = {}) {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing AUTOMATION_WORKER_URL environment variable.");
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: buildHeaders(init.headers),
    cache: "no-store",
  });
}

export async function jsonFromWorker(path: string, init: RequestInit = {}) {
  try {
    const response = await fetchWorker(path, init);
    const text = await response.text();

    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Automation worker is unavailable.",
      },
      { status: 503 },
    );
  }
}

export async function proxyFileFromWorker(path: string) {
  try {
    const response = await fetchWorker(path);
    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    const contentDisposition = response.headers.get("content-disposition");
    const contentLength = response.headers.get("content-length");

    if (contentType) headers.set("content-type", contentType);
    if (contentDisposition) {
      headers.set("content-disposition", contentDisposition);
    }
    if (contentLength) headers.set("content-length", contentLength);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Automation worker is unavailable.",
      { status: 503 },
    );
  }
}
