// Pikku aktarma sunucusu
// ntfy'nin Pikku'nun kullandığı küçük bir alt kümesini konuşur:
//   GET  /<konu>/ws?since=<id|12h|all>   → WebSocket; önce {"event":"open"}, sonra bekleyen ve yeni mesajlar
//   POST /<konu>[?cache=no]               → mesaj yayınla (cache=no: saklama, yalnızca o an bağlı olanlara ilet)
// Mesajlar istemcide uçtan uca şifrelenir; sunucu yalnızca okunamaz metin görür ve 12 saat sonra siler.
// Her konu kendi Durable Object'inde yaşar; bağlantılar "uyuyabilir" (hibernation), boşta ücret ve kota harcamaz.
import { DurableObject } from 'cloudflare:workers';

const KEEP_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 8192;
const MAX_ROWS = 2000;
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '86400' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return new Response('Pikku aktarma sunucusu çalışıyor.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    if (parts[0] === 'v1' && parts[1] === 'health') return json({ healthy: true });
    const topic = parts[0];
    if (!TOPIC.test(topic)) return json({ error: 'bad topic' }, 400);
    const ws = parts[1] === 'ws';
    if (parts.length > (ws ? 2 : 1)) return json({ error: 'not found' }, 404);
    if (ws && req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket required' }, 426);
    if (!ws && req.method !== 'POST') return json({ error: 'attachments are not supported here' }, 405);
    return env.ROOMS.get(env.ROOMS.idFromName(topic)).fetch(req);
  }
};

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
