const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
function cleanKey(value) {
  return String(value || "").trim();
}
const SYNC_ENTITY_TYPES = new Set(["visit", "job_event", "route", "route_stop"]);
function syncOriginAllowed(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1"
      || hostname === "localhost"
      || hostname === "map-preview.hpd-bid-dashboard-2026.pages.dev"
      || hostname.endsWith(".hpd-bid-dashboard-2026.pages.dev");
  } catch {
    return false;
  }
}
function validMutation(value) {
  return Boolean(value && typeof value === "object"
    && cleanKey(value.id)
    && cleanKey(value.entityId)
    && SYNC_ENTITY_TYPES.has(cleanKey(value.entityType))
    && (value.action === "upsert" || value.action === "delete"));
}
function minimalSyncEntity(mutation, syncedAt) {
  const entity = mutation.entity && typeof mutation.entity === "object" ? mutation.entity : {};
  const common = {
    id: cleanKey(mutation.entityId).slice(0, 220),
    entityType: cleanKey(mutation.entityType),
    syncedAt,
  };
  if (mutation.entityType === "route") {
    return { ...common, acceptedAt: cleanKey(entity.acceptedAt).slice(0, 40), stopCount: Math.max(0, Math.min(12, Number(entity.stopCount || 0))), status: cleanKey(entity.status).slice(0, 40) };
  }
  if (mutation.entityType === "route_stop") {
    return { ...common, routeId: cleanKey(entity.routeId).slice(0, 220), jobId: cleanKey(entity.jobId).slice(0, 80), stopIndex: Math.max(0, Math.min(12, Number(entity.stopIndex || 0))), status: cleanKey(entity.status).slice(0, 40) };
  }
  if (mutation.entityType === "job_event") {
    return { ...common, jobId: cleanKey(entity.jobId).slice(0, 80), step: cleanKey(entity.step).slice(0, 80), occurredAt: cleanKey(entity.occurredAt).slice(0, 40) };
  }
  return { ...common, jobId: cleanKey(entity.jobId).slice(0, 80), status: cleanKey(entity.status).slice(0, 80), occurredAt: cleanKey(entity.occurredAt).slice(0, 40) };
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (!env.HPD_STATUS_OVERRIDES) {
      return json({ ok: false, error: "KV binding HPD_STATUS_OVERRIDES is missing." }, 500);
    }
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "HPD status override worker" });
    }
    if (url.pathname === "/overrides" && request.method === "GET") {
      const list = await env.HPD_STATUS_OVERRIDES.list();
      const overrides = {};
      for (const item of list.keys) {
        if (item.name.startsWith("__sync__:")) continue;
        const value = await env.HPD_STATUS_OVERRIDES.get(item.name, "json");
        if (value) overrides[item.name] = value;
      }
      return json({ ok: true, overrides });
    }
    if (url.pathname === "/sync" && request.method === "GET") {
      return json({ ok: true, sync: true, version: 1, entityTypes: [...SYNC_ENTITY_TYPES] });
    }
    if (url.pathname === "/sync" && request.method === "POST") {
      if (!syncOriginAllowed(request)) return json({ ok: false, error: "Origin is not allowed." }, 403);
      const body = await request.json().catch(() => null);
      const deviceId = cleanKey(body?.deviceId).slice(0, 160);
      const mutations = Array.isArray(body?.mutations) ? body.mutations.slice(0, 50) : [];
      if (JSON.stringify(body || {}).length > 100_000) return json({ ok: false, error: "Sync batch is too large." }, 413);
      if (!deviceId || !mutations.length || mutations.some((mutation) => !validMutation(mutation))) {
        return json({ ok: false, error: "A device id and 1-50 valid mutations are required." }, 400);
      }
      const syncedAt = new Date().toISOString();
      const accepted = [];
      for (const mutation of mutations) {
        const mutationId = cleanKey(mutation.id).slice(0, 220);
        const entityType = cleanKey(mutation.entityType);
        const entityId = cleanKey(mutation.entityId).slice(0, 220);
        const key = `__sync__:${entityType}:${entityId}`;
        if (mutation.action === "delete") await env.HPD_STATUS_OVERRIDES.delete(key);
        else await env.HPD_STATUS_OVERRIDES.put(key, JSON.stringify({ ...minimalSyncEntity(mutation, syncedAt), deviceId }));
        accepted.push(mutationId);
      }
      return json({ ok: true, accepted, syncedAt });
    }
    if (url.pathname === "/override" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const key = cleanKey(body?.key || body?.OMO || body?.omo || body?.id);
      const patch = body?.patch && typeof body.patch === "object" ? body.patch : body;
      if (!key) {
        return json({ ok: false, error: "Missing key/OMO." }, 400);
      }
      const saved = {
        ...patch,
        OMO: key,
        updatedAt: new Date().toISOString(),
      };
      await env.HPD_STATUS_OVERRIDES.put(key, JSON.stringify(saved));
      return json({ ok: true, key, override: saved });
    }
    if (url.pathname === "/override" && request.method === "DELETE") {
      const key = cleanKey(url.searchParams.get("key"));
      if (!key) {
        return json({ ok: false, error: "Missing key." }, 400);
      }
      await env.HPD_STATUS_OVERRIDES.delete(key);
      return json({ ok: true, deleted: key });
    }
    return json({ ok: false, error: "Not found." }, 404);
  },
};
