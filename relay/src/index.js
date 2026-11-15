// Pikku aktarma sunucusu
// ntfy'nin Pikku'nun kullandığı küçük bir alt kümesini konuşur:
//   GET  /<konu>/ws?since=<id|12h|all>   → WebSocket; önce {"event":"open"}, sonra bekleyen ve yeni mesajlar
//   POST /<konu>[?cache=no]               → mesaj yayınla (cache=no: saklama, yalnızca o an bağlı olanlara ilet)
//   PUT  /<konu>?filename=m.bin            → şifreli dosya yükle (R2), {attachment:{url}} döner
//   GET  /f/<konu>/<ad>                     → şifreli dosyayı indir
// Mesajlar ve dosyalar istemcide uçtan uca şifrelenir; sunucu yalnızca okunamaz veri görür ve 7 gün sonra siler.
// Her konu kendi Durable Object'inde yaşar; bağlantılar "uyuyabilir" (hibernation), boşta ücret ve kota harcamaz.
import { DurableObject } from 'cloudflare:workers';

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE = 30 * 1024 * 1024;
const MAX_BODY = 8192;
const MAX_ROWS = 20000;
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '86400' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return new Response('Pikku aktarma sunucusu çalışıyor.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    if (parts[0] === 'v1' && parts[1] === 'health') return json({ healthy: true });
    if (parts[0] === 'turn' && parts.length === 1) return turn(req, env);
    if (parts[0] === 'f' && parts.length === 3 && req.method === 'GET') return getFile(env, parts[1], parts[2]);
    const topic = parts[0];
    if (!TOPIC.test(topic)) return json({ error: 'bad topic' }, 400);
    const ws = parts[1] === 'ws';
    if (parts.length > (ws ? 2 : 1)) return json({ error: 'not found' }, 404);
    if (ws && req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket required' }, 426);
    if (!ws && req.method === 'PUT') return putFile(req, env, topic, url);
    if (!ws && req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return env.ROOMS.get(env.ROOMS.idFromName(topic)).fetch(req);
  }
};

// ---- Dosyalar (fotoğraf/video): R2'de, uçtan uca şifreli, 7 gün sonra silinir
const NAME = /^[A-Za-z0-9_-]{8,64}$/;
async function putFile(req, env, topic, url) {
  if (!env.MEDIA) return json({ error: 'storage not configured' }, 405);
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_FILE) return json({ error: 'too large' }, 413);
  const body = await req.arrayBuffer();
  if (!body.byteLength) return json({ error: 'empty' }, 400);
  if (body.byteLength > MAX_FILE) return json({ error: 'too large' }, 413);
  const name = crypto.randomUUID().replace(/-/g, '');
  await env.MEDIA.put(`${topic}/${name}`, body, { httpMetadata: { contentType: 'application/octet-stream' } });
  // Süresi dolanları ara sıra temizle (ayrı bir zamanlayıcıya gerek kalmasın)
  try {
    const old = Date.now() - KEEP_MS, list = await env.MEDIA.list({ prefix: topic + '/', limit: 200 });
    const dead = list.objects.filter(o => o.uploaded.getTime() < old).map(o => o.key);
    if (dead.length) await env.MEDIA.delete(dead);
  } catch {}
  const expires = Math.floor((Date.now() + KEEP_MS) / 1000);
  return json({ event: 'message', attachment: { name: 'm.bin', url: `${url.origin}/f/${topic}/${name}`, size: body.byteLength, expires } });
}
async function getFile(env, topic, name) {
  if (!env.MEDIA || !TOPIC.test(topic) || !NAME.test(name)) return json({ error: 'not found' }, 404);
  const obj = await env.MEDIA.get(`${topic}/${name}`);
  if (!obj) return json({ error: 'not found' }, 404);
  if (obj.uploaded.getTime() < Date.now() - KEEP_MS) { await env.MEDIA.delete(`${topic}/${name}`); return json({ error: 'expired' }, 410); }
  return new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=604800, immutable', ...CORS } });
}

// Görüntülü/sesli arama için kısa ömürlü TURN bilgisi (Cloudflare Realtime TURN).
// İki cihaz arasında doğrudan yol bulunamadığında görüşme bu sunucu üzerinden aktarılır.
// Anahtarlar Worker ayarlarında gizli değişken olarak durur (Cloudflare: TURN_KEY_ID + TURN_KEY_API_TOKEN; Metered: METERED_TURN_URL)
const ALLOWED_ORIGINS = [/^https:\/\/emrexati\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
let turnCache = null;
async function turn(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGINS.some(r => r.test(origin))) return json({ error: 'forbidden' }, 403);
  const cf = env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN, metered = env.METERED_TURN_URL;
  if (!cf && !metered) return json({ iceServers: [], configured: false });
  const now = Date.now();
  if (!turnCache || turnCache.until < now + 30 * 60e3) {
    // İki sağlayıcıdan biri: Cloudflare Realtime TURN (TURN_KEY_ID + TURN_KEY_API_TOKEN)
    // ya da Metered Open Relay (METERED_TURN_URL: panodaki ".../api/v1/turn/credentials?apiKey=..." adresi)
    const r = cf
      ? await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
          method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 6 * 3600 })
        })
      : await fetch(metered);
    if (!r.ok) return json({ iceServers: [], error: 'turn ' + r.status });
    const raw = await r.json(), o = Array.isArray(raw) ? { iceServers: raw } : raw;
    // Tarayıcıların yavaşladığı 53 numaralı bağlantı noktasını çıkar
    const servers = (o.iceServers || []).map(s => ({ ...s, urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
    turnCache = { until: now + 6 * 3600e3, iceServers: servers };
  }
  return json({ iceServers: turnCache.iceServers, expires: Math.floor(turnCache.until / 1000) });
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS m (seq INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, body TEXT NOT NULL)');
    // İstemcinin 25 sn'lik "ping"ine nesne uyanmadan "pong" döner: ücretsiz canlı tutma
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') === 'websocket') return this.subscribe(url);
    return this.publish(req, url);
  }

  subscribe(url) {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ event: 'open', server: 'pikku', time: Math.floor(Date.now() / 1000) }));
    const since = url.searchParams.get('since') || '';
    let rows;
    const now = Date.now();
    if (/^\d+$/.test(since)) rows = this.sql.exec('SELECT seq, t, body FROM m WHERE seq > ? AND t > ? ORDER BY seq', Number(since), now - KEEP_MS).toArray();
    else if (since === 'all') rows = this.sql.exec('SELECT seq, t, body FROM m WHERE t > ? ORDER BY seq', now - KEEP_MS).toArray();
    else {
      const h = /^(\d+)h$/.exec(since), mins = /^(\d+)m$/.exec(since);
      const ms = h ? Number(h[1]) * 3600e3 : mins ? Number(mins[1]) * 60e3 : 0;
      rows = ms ? this.sql.exec('SELECT seq, t, body FROM m WHERE t > ? ORDER BY seq', now - Math.min(ms, KEEP_MS)).toArray() : [];
    }
    for (const r of rows) server.send(JSON.stringify({ event: 'message', id: String(r.seq), time: Math.floor(r.t / 1000), message: r.body }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(req, url) {
    const body = await req.text();
    if (!body) return json({ error: 'empty' }, 400);
    if (body.length > MAX_BODY) return json({ error: 'too large' }, 413);
    const now = Date.now();
    const store = url.searchParams.get('cache') !== 'no';
    let id = 'e' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    if (store) {
      this.sql.exec('DELETE FROM m WHERE t <= ?', now - KEEP_MS);
      id = String(this.sql.exec('INSERT INTO m (t, body) VALUES (?, ?) RETURNING seq', now, body).one().seq);
      this.sql.exec('DELETE FROM m WHERE seq <= ?', Number(id) - MAX_ROWS);
    }
    const out = JSON.stringify({ event: 'message', id, time: Math.floor(now / 1000), message: body });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(out); } catch {} }
    return json({ id, time: Math.floor(now / 1000), event: 'message' });
  }

  webSocketMessage() {}
  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {} }
  webSocketError() {}
}
