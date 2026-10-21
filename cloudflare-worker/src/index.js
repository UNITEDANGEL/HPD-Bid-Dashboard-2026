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
// One combined copy of every job's saved steps: loading them costs 1 KV read instead of a list plus
// one read per job (the free plan allows 1,000 lists a day, which busy days used up: error 1101).
const ALL_KEY = "__all_overrides__";
async function buildAll(env) {
  const all = {};
  let cursor;
  do {
    const page = await env.HPD_STATUS_OVERRIDES.list(cursor ? { cursor } : undefined);
    for (const item of page.keys) {
      if (item.name.startsWith("__sync__:") || item.name === ALL_KEY) continue;
      const value = await env.HPD_STATUS_OVERRIDES.get(item.name, "json");
      if (value) all[item.name] = value;
    }
    cursor = page.list_complete === false ? page.cursor : undefined;
  } while (cursor);
  await env.HPD_STATUS_OVERRIDES.put(ALL_KEY, JSON.stringify(all));
  return all;
}
// Keep the combined copy in step with a save or delete. Only once it exists: a save made before the
// first full build must not start a copy holding just that one job.
async function updateAll(env, key, value) {
  const all = await env.HPD_STATUS_OVERRIDES.get(ALL_KEY, "json");
  if (!all) return;
  if (value) all[key] = value; else delete all[key];
  await env.HPD_STATUS_OVERRIDES.put(ALL_KEY, JSON.stringify(all));
}
// The last good copy, kept in memory: phones asking within 20 seconds share one KV read, and when KV is
// over its free daily limit (14 Oct 2026) the phones get the last copy instead of an error.
let memory = null; // { at, overrides }
const FRESH_MS = 20_000;
function remember(overrides) { memory = { at: Date.now(), overrides }; }
function rememberChange(key, value) {
  if (!memory) return;
  if (value) memory.overrides[key] = value; else delete memory.overrides[key];
}

// Cloud sync of field records stays off until SYNC_ENABLED = "1" is set on the Worker.
const syncOn = (env) => env.SYNC_ENABLED === "1";

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      // A KV limit or outage answers as "busy" (the phones keep their saved steps and retry).
      return json({ ok: false, error: "Status server is busy. Try again shortly.", detail: String(error?.message || error).slice(0, 160) }, 503);
    }
  },
};

async function handle(request, env) {
  {
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
    // Phone alert addresses (encrypted) straight from storage, not from the combined list (21 Oct: a phone's entry was
    // lost from the combined list when other saves rewrote it at the same time).
    if (url.pathname === "/push-subs" && request.method === "GET") {
      const out = {};
      let cursor;
      do {
        const page = await env.HPD_STATUS_OVERRIDES.list({ prefix: "PUSH-", cursor });
        for (const item of page.keys) out[item.name] = await env.HPD_STATUS_OVERRIDES.get(item.name, "json");
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ ok: true, subs: out });
    }
    if (url.pathname === "/overrides" && request.method === "GET") {
      const freshMs = env.OVERRIDES_CACHE_MS === undefined ? FRESH_MS : Number(env.OVERRIDES_CACHE_MS);
      if (memory && Date.now() - memory.at < freshMs) return json({ ok: true, overrides: memory.overrides });
      try {
        const overrides = (await env.HPD_STATUS_OVERRIDES.get(ALL_KEY, "json")) || (await buildAll(env));
        remember(overrides);
        return json({ ok: true, overrides });
      } catch (error) {
        if (memory) return json({ ok: true, overrides: memory.overrides, stale: true });
        throw error;
      }
    }
    if (url.pathname === "/sync" && request.method === "GET") {
      return json({ ok: true, sync: syncOn(env), version: 1, entityTypes: [...SYNC_ENTITY_TYPES] });
    }
    if (url.pathname === "/sync" && request.method === "POST") {
      if (!syncOn(env)) return json({ ok: false, error: "Cloud sync is off." }, 403);
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
      await updateAll(env, key, saved);
      rememberChange(key, saved);
      return json({ ok: true, key, override: saved });
    }
    if (url.pathname === "/override" && request.method === "DELETE") {
      const key = cleanKey(url.searchParams.get("key"));
      if (!key) {
        return json({ ok: false, error: "Missing key." }, 400);
      }
      await env.HPD_STATUS_OVERRIDES.delete(key);
      await updateAll(env, key, null);
      rememberChange(key, null);
      return json({ ok: true, deleted: key });
    }
    return json({ ok: false, error: "Not found." }, 404);
  }
}
