// Recomp Health relay: a tiny private inbox for Health Auto Export, run as a Cloudflare Worker.
//
// Health Auto Export POSTs your Apple Health data to /ingest, and Recomp collects it from /batches.
// Both must send the header  X-API-Key: <your RELAY_KEY>.  Batches are kept for 21 days, then expire.
//
// Setup (Cloudflare dashboard, no tools needed):
//   1. Workers & Pages → Create → Worker → paste this file → Deploy.
//   2. Storage & Databases → KV → create a namespace (e.g. "recomp-health").
//   3. Your worker → Settings → Bindings → add KV namespace, variable name  HEALTH.
//   4. Your worker → Settings → Variables and Secrets → add Secret  RELAY_KEY  (Recomp generates one for you).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
  'Access-Control-Max-Age': '86400'
};
const MAX_BODY = 20 * 1024 * 1024;   // KV values can be up to 25 MiB
const KEEP_DAYS = 21;
const PAGE = 20;                      // batches returned per /batches call

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Constant-time comparison so the key can't be guessed by timing.
function sameKey(given, secret) {
  if (typeof given !== 'string' || typeof secret !== 'string' || !secret) return false;
  let diff = given.length ^ secret.length;
  for (let i = 0; i < Math.max(given.length, secret.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.HEALTH || !env.RELAY_KEY) return json({ error: 'Relay not set up: bind a KV namespace as HEALTH and add the secret RELAY_KEY.' }, 500);
    if (!sameKey(req.headers.get('X-API-Key') || '', env.RELAY_KEY)) return json({ error: 'Wrong or missing X-API-Key' }, 401);

    // Health Auto Export → relay
    if (req.method === 'POST' && url.pathname === '/ingest') {
      if ((+req.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: 'Too large' }, 413);
      const body = await req.text();
      if (!body) return json({ error: 'Empty body' }, 400);
      if (body.length > MAX_BODY) return json({ error: 'Too large' }, 413);
      const ts = Date.now();
      const key = `batch:${String(ts).padStart(13, '0')}-${crypto.randomUUID().slice(0, 8)}`;   // sorts by time
      await env.HEALTH.put(key, body, { expirationTtl: KEEP_DAYS * 86400 });
      return json({ ok: true, key });
    }

    // Relay → Recomp: batches stored after `after` (a batch key), oldest first.
    if (req.method === 'GET' && url.pathname === '/batches') {
      const after = url.searchParams.get('after') || '';
      const names = [];
      let cursor;
      do {
        const r = await env.HEALTH.list({ prefix: 'batch:', cursor });
        for (const k of r.keys) names.push(k.name);
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
      const newer = names.filter(n => n > after).sort();
      const batches = [];
      for (const key of newer.slice(0, PAGE)) {
        const body = await env.HEALTH.get(key);
        if (body != null) batches.push({ key, ts: +key.slice(6, 19), body });
      }
      return json({ batches, more: newer.length > PAGE, stored: names.length, latest: names.length ? names.sort().pop() : null });
    }

    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, name: 'Recomp Health relay' });
    return json({ error: 'Not found' }, 404);
  }
};
