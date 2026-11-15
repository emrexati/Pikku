// Pikku web — iPhone'daki Pikku ile aynı protokolü kullanır (PBKDF2 + HKDF + AES-GCM, ntfy aktarma).
{
'use strict';

// ---------------------------------------------------------------- yardımcılar
const $ = s => document.querySelector(s);
const te = new TextEncoder(), td = new TextDecoder();
const nowS = () => Date.now() / 1000;
const uuid = () => crypto.randomUUID().toUpperCase();
const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
             set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} },
             del: k => { try { localStorage.removeItem(k); } catch {} } };
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const bin = atob(str.trim()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function concat(a, b) { const u = new Uint8Array(a.length + b.length); u.set(a); u.set(b, a.length); return u; }
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
const deflate = u8 => pipe(u8, new CompressionStream('deflate-raw'));
const inflate = u8 => pipe(u8, new DecompressionStream('deflate-raw'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isToday = d => sameDay(d, new Date());
const isYesterday = d => sameDay(d, new Date(Date.now() - 864e5));
const durText = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const ICON = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4 4 10-10"/></svg>',
  checks: '<svg viewBox="0 0 24 24" style="width:18px"><path d="m2 12.5 4 4 10-10M10 16.5l1 0 10-10"/></svg>',
  fail: '<svg viewBox="0 0 24 24" class="fail"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  play: '<svg viewBox="0 0 24 24" style="fill:#fff;stroke:none"><path d="M8 5v14l11-7z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>',
  micOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M9 9v1a3 3 0 0 0 5 2.2M15 9.3V5a3 3 0 0 0-5.9-.7M5 10a7 7 0 0 0 11.5 5.4M19 10a7 7 0 0 1-.6 2.8M12 17v5"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="3"/><path d="m16 10 6-3v10l-6-3"/></svg>',
  videoOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M16 16v-1M16 10l6-3v10l-6-3M10 6h3a3 3 0 0 1 3 3v3M2 9a3 3 0 0 1 1-2M2 9v6a3 3 0 0 0 3 3h9"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14 9v2h2M10 17v-2H8"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  hang: '<svg viewBox="0 0 24 24" style="transform:rotate(135deg)"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>'
};

// ---------------------------------------------------------------- yerel depo (IndexedDB, şifreli)
const db = {
  _p: null,
  open() {
    return this._p ||= new Promise((res, rej) => {
      const r = indexedDB.open('pikku', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  },
  get(k) { return this.run('readonly', s => s.get(k)); },
  set(k, v) { return this.run('readwrite', s => s.put(v, k)); },
  del(k) { return this.run('readwrite', s => s.delete(k)); },
  async delPrefix(p) {
    const d = await this.open();
    return new Promise(res => {
      const tx = d.transaction('kv', 'readwrite');
      const st = tx.objectStore('kv');
      const r = st.openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return; if (String(c.key).startsWith(p)) c.delete(); c.continue(); };
      tx.oncomplete = () => res();
    });
  }
};

const vault = {
  key: null,
  async init() {
    this.key = await db.get('localKey');
    if (!this.key) {
      this.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await db.set('localKey', this.key);
    }
  },
  async seal(u8) { const iv = crypto.getRandomValues(new Uint8Array(12)); return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, u8))); },
  async open(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, this.key, u8.subarray(12))); },
  async putJSON(k, v) { await db.set(k, await this.seal(te.encode(JSON.stringify(v)))); },
  async getJSON(k) { const v = await db.get(k); if (!v) return null; try { return JSON.parse(td.decode(await this.open(v))); } catch { return null; } },
  async putBytes(k, u8) { await db.set(k, await this.seal(u8)); },
  async getBytes(k) { const v = await db.get(k); if (!v) return null; try { return await this.open(v); } catch { return null; } }
};

// ---------------------------------------------------------------- uçtan uca şifreleme (iPhone ile aynı)
const normalize = code => code.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');

async function deriveRoom(code) {
  const base = await crypto.subtle.importKey('raw', te.encode(normalize(code)), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('sohbet-v2-salt-2026'), iterations: 300000, hash: 'SHA-256' }, base, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const bits = async (info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) }, hk, n * 8));
  const key = await crypto.subtle.importKey('raw', await bits('enc', 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, topic: 'sb' + hex(await bits('topic', 20)), mediaTopic: 'sm' + hex(await bits('media', 20)) };
}

const room = {
  key: null, topic: '', mediaTopic: '',
  async sealData(u8) { const iv = crypto.getRandomValues(new Uint8Array(12)); return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, u8))); },
  async openData(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, this.key, u8.subarray(12))); },
  async seal(env) { return b64(await this.sealData(await deflate(te.encode(JSON.stringify(env))))); },
  async open(text) { try { return JSON.parse(td.decode(await inflate(await this.openData(unb64(text))))); } catch { return null; } }
};

// ---------------------------------------------------------------- aktarma sunucusu (ntfy)
class Relay {
  constructor(server, topic, since) { this.server = server.replace(/\/+$/, ''); this.topic = topic; this.since = since; this.ws = null; this.stopped = true; this.retry = 1; this.last = Date.now(); this.onMessage = null; this.onState = null; }
  start() { this.stopped = false; this.connect(); clearInterval(this.dog); this.dog = setInterval(() => { if (!this.stopped && Date.now() - this.last > 75000) { this.onState?.(false); this.reconnect(); } }, 20000); }
  stop() { this.stopped = true; clearInterval(this.dog); if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; }
  reconnect() { if (this.stopped) return; if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; this.retry = 1; this.connect(); }
  connect() {
    if (this.stopped) return;
    const url = this.server.replace(/^http/, 'ws') + '/' + this.topic + '/ws?since=' + encodeURIComponent(this.since);
    let ws;
    try { ws = new WebSocket(url); } catch { return this.later(); }
    this.ws = ws; this.last = Date.now();
    ws.onmessage = ev => {
      if (ws !== this.ws) return;
      this.last = Date.now();
      let o; try { o = JSON.parse(ev.data); } catch { return; }
      if (o.event === 'open' || o.event === 'keepalive') { this.retry = 1; this.onState?.(true); return; }
      if (o.event !== 'message' || !o.id || typeof o.message !== 'string') return;
      this.since = o.id; this.onState?.(true); this.onMessage?.(o.id, o.message);
    };
    ws.onclose = () => { if (ws !== this.ws) return; this.onState?.(false); this.later(); };
  }
  later() { this.ws = null; const d = this.retry; this.retry = Math.min(this.retry * 2, 30); setTimeout(() => { if (!this.stopped && !this.ws) this.connect(); }, d * 1000); }
  async publish(body, cache = true, keepalive = false) {
    const r = await fetch(this.server + '/' + this.topic + (cache ? '' : '?cache=no'), { method: 'POST', body, keepalive, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('server');
  }
  async upload(u8, topic) {
    const r = await fetch(this.server + '/' + topic + '?filename=m.bin', { method: 'PUT', body: u8 });
    if (r.status === 413) throw new Error('tooLarge');
    if (!r.ok) throw new Error('server');
    const o = await r.json();
    if (!o.attachment?.url) throw new Error('bad');
    return o.attachment.url;
  }
  async download(url) {
    const r = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (r.status === 404 || r.status === 410) throw new Error('expired');
    if (!r.ok) throw new Error('server');
    return new Uint8Array(await r.arrayBuffer());
  }
}

// ---------------------------------------------------------------- temalar ve duvar kağıtları
const WALLS = [
  { name: 'Çayır', light: [0xA9CDA0, 0xD9E6BF], dark: [0x0E1621, 0x0E1621] },
  { name: 'Okyanus', light: [0x8EC5E8, 0xD3E9F5], dark: [0x0B1A2A, 0x10263B] },
  { name: 'Gün batımı', light: [0xF2AE86, 0xF8DDC0], dark: [0x2A1515, 0x1A0F14] },
  { name: 'Lavanta', light: [0xC3B5E8, 0xE6DEF6], dark: [0x1B1530, 0x120E22] },
  { name: 'Gri', light: [0xD5D8DC, 0xEEF0F2], dark: [0x1C1C1E, 0x121214] },
  { name: 'Masal Gezegeni', light: [0x24306A, 0xF4C9A2], dark: [0x10153A, 0x4A3A6A], style: 'storybook',
    preset: { mode: 0, accent: 0xE9A23B, myBubble: 0xFFF1D6, myText: 0x3A2A10, theirBubble: 0xFFFFFF, theirText: 0x1E2A5A } },
  { name: 'Olay Ufku', light: [0x05060A, 0x0B0D16], dark: [0x05060A, 0x0B0D16], style: 'eventHorizon',
    preset: { mode: 2, accent: 0xF4A340, myBubble: 0x3A2814, myText: 0xFFE7B0, theirBubble: 0x1A1C24, theirText: 0xE6E8EF } },
  { name: 'Laboratuvar', light: [0xE4F6F1, 0xF4FBF9], dark: [0x0C2226, 0x10292E], style: 'science',
    preset: { mode: 1, accent: 0x1FA08A, myBubble: 0xD0F2EA, myText: 0x0D3B33, theirBubble: 0xFFFFFF, theirText: 0x16302B } },
  { name: 'Uzay', light: [0x0B0F2E, 0x2A1550], dark: [0x0B0F2E, 0x2A1550], style: 'space',
    preset: { mode: 2, accent: 0x8E7CFF, myBubble: 0x3B2C7A, myText: 0xF1EEFF, theirBubble: 0x1B1F3B, theirText: 0xE4E6FF } }
];
const ACCENTS = [0x2AA3E6, 0x34A853, 0x8E5CF7, 0xF2994A, 0xE84D8A, 0xE5484D, 0x5C6B7A];
const css = (h, a = 1) => `rgba(${h >> 16 & 255},${h >> 8 & 255},${h & 255},${a})`;
const toHex = h => '#' + h.toString(16).padStart(6, '0');
const fromHex = s => parseInt(s.slice(1), 16);

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rr = (r, a, b) => a + r() * (b - a);

const Paint = {
  sparkle(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); },
  stars(c, w, h, n, maxY, color, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) { const x = rr(r, 0, w), y = rr(r, 0, h * maxY), s = rr(r, .6, 2); c.fillStyle = css(color, rr(r, .25, .95)); c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); }
    c.fillStyle = css(color, .85);
    for (let i = 0; i < Math.max(3, n / 20 | 0); i++) this.sparkle(c, rr(r, 0, w), rr(r, 0, h * maxY), rr(r, 5, 9));
  },
  planet(c, x, y, R, b0, b1, ring, tilt) {
    const ringPath = () => { c.beginPath(); c.ellipse(0, 0, R * 1.9, R * .45, 0, 0, Math.PI * 2); };
    c.save(); c.translate(x, y); c.rotate(tilt * Math.PI / 180); ringPath(); c.strokeStyle = css(ring, .8); c.lineWidth = R * .16; c.stroke(); c.restore();
    const g = c.createLinearGradient(x - R, y - R, x + R, y + R); g.addColorStop(0, css(b0)); g.addColorStop(1, css(b1));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
    c.save(); c.translate(x, y); c.rotate(tilt * Math.PI / 180); c.beginPath(); c.rect(-R * 2.2, 0, R * 4.4, R); c.clip(); ringPath(); c.strokeStyle = css(ring, .95); c.lineWidth = R * .16; c.stroke(); c.restore();
  },
  storybook(c, w, h, dark) {
    this.stars(c, w, h, 70, .55, 0xFFF4D6, 11);
    const mx = w * .8, my = h * .12;
    c.save(); c.beginPath(); c.arc(mx, my, 26, 0, 7); c.arc(mx + 12, my - 8, 26, 0, 7, true); c.fillStyle = css(0xFFE9B8, .95); c.fill('evenodd'); c.restore();
    this.planet(c, w * .18, h * .3, 15, 0xF7C6D9, 0xC98BD6, 0xFFF4D6, -14);
    const r = rng(23);
    for (let i = 0; i < 5; i++) { const cx = rr(r, 0, w), cy = rr(r, h * .35, h * .62), cw = rr(r, 90, 170); c.fillStyle = css(0xFFFFFF, dark ? .06 : .16); c.beginPath(); c.roundRect(cx - cw / 2, cy, cw, cw * .26, cw * .13); c.fill(); }
    c.fillStyle = css(dark ? 0x3A2E62 : 0xE9B48E, .75); c.beginPath(); c.ellipse(-w * .3 + w * .55, h * .82 + h * .25, w * .55, h * .25, 0, 0, 7); c.fill();
    c.fillStyle = css(dark ? 0x2A2350 : 0xDD9C7A, .85); c.beginPath(); c.ellipse(w * .25 + w * .6, h * .88 + h * .25, w * .6, h * .25, 0, 0, 7); c.fill();
  },
  eventHorizon(c, w, h) {
    this.stars(c, w, h, 150, 1, 0xFFFFFF, 7);
    const x = w * .5, y = h * .3, R = Math.min(w, h) * .15;
    const disk = () => { c.beginPath(); c.ellipse(0, 0, R * 2.7, R * .5, 0, 0, 7); };
    c.save(); c.translate(x, y); c.rotate(-8 * Math.PI / 180); c.filter = 'blur(14px)'; disk(); c.strokeStyle = css(0xF4A340, .55); c.lineWidth = R * .45; c.stroke(); c.restore();
    c.save(); c.translate(x, y); c.rotate(-8 * Math.PI / 180); disk(); c.strokeStyle = css(0xFFD58A, .8); c.lineWidth = R * .12; c.stroke(); c.restore();
    c.save(); c.filter = 'blur(10px)'; c.beginPath(); c.arc(x, y, R * 1.1, 0, 7); c.strokeStyle = css(0xFFC56B, .9); c.lineWidth = R * .22; c.stroke(); c.restore();
    c.beginPath(); c.arc(x, y, R * 1.05, 0, 7); c.strokeStyle = css(0xFFF1CF, .9); c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = '#000'; c.fill();
    c.save(); c.translate(x, y); c.rotate(-8 * Math.PI / 180); c.beginPath(); c.rect(-R * 3, 0, R * 6, R); c.clip();
    disk(); c.strokeStyle = css(0xFFB24D, .95); c.lineWidth = R * .22; c.stroke(); disk(); c.strokeStyle = css(0xFFF1CF, .9); c.lineWidth = 2; c.stroke(); c.restore();
  },
  icon(c, k) {
    c.beginPath();
    switch (k) {
      case 0: c.ellipse(0, 0, 12, 4.5, 0, 0, 7); c.moveTo(12 * Math.cos(1.05) * .0, 0); c.stroke(); c.beginPath(); c.ellipse(0, 0, 12, 4.5, 1.05, 0, 7); c.stroke(); c.beginPath(); c.ellipse(0, 0, 12, 4.5, -1.05, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 2, 0, 7); c.fill(); return;
      case 1: c.moveTo(-4, -11); c.lineTo(-4, -3); c.lineTo(-10, 9); c.quadraticCurveTo(-11, 11, -8, 11); c.lineTo(8, 11); c.quadraticCurveTo(11, 11, 10, 9); c.lineTo(4, -3); c.lineTo(4, -11); c.moveTo(-6, -11); c.lineTo(6, -11); c.moveTo(-7, 4); c.lineTo(7, 4); break;
      case 2: c.arc(0, -3, 7, Math.PI * .8, Math.PI * 2.2); c.lineTo(3.5, 7); c.lineTo(-3.5, 7); c.closePath(); c.moveTo(-3, 10); c.lineTo(3, 10); break;
      case 3: c.moveTo(-9, 9); c.quadraticCurveTo(-10, -9, 10, -10); c.quadraticCurveTo(9, 9, -9, 9); c.moveTo(-9, 9); c.lineTo(3, -3); break;
      case 4: c.moveTo(0, -11); c.quadraticCurveTo(9, 0, 7, 5); c.arc(0, 4, 7, 0.1, Math.PI - .1); c.quadraticCurveTo(-9, 0, 0, -11); break;
      case 5: c.moveTo(2, -11); c.lineTo(-6, 1); c.lineTo(1, 1); c.lineTo(-2, 11); c.lineTo(7, -2); c.lineTo(0, -2); c.closePath(); break;
      case 6: for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](11 * Math.cos(a), 11 * Math.sin(a)); } c.closePath(); c.moveTo(6, 0); c.arc(0, 0, 6, 0, 7); break;
      case 7: c.arc(0, 0, 5, 0, 7); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(8 * Math.cos(a), 8 * Math.sin(a)); c.lineTo(11 * Math.cos(a), 11 * Math.sin(a)); } break;
      case 8: for (let i = -10; i <= 10; i += 1) { const y = i, x = 6 * Math.sin(i / 3.2); i === -10 ? c.moveTo(x, y) : c.lineTo(x, y); } for (let i = -10; i <= 10; i += 1) { const y = i, x = -6 * Math.sin(i / 3.2); i === -10 ? c.moveTo(x, y) : c.lineTo(x, y); } for (let i = -8; i <= 8; i += 4) { c.moveTo(-6 * Math.sin(i / 3.2), i); c.lineTo(6 * Math.sin(i / 3.2), i); } break;
      default: c.arc(-2, -2, 7, 0, 7); c.moveTo(3, 3); c.lineTo(10, 10);
    }
    c.stroke();
  },
  science(c, w, h, dark) {
    const r = rng(42), cell = 76;
    c.strokeStyle = css(dark ? 0x5FD3BC : 0x1FA08A, dark ? .24 : .22); c.fillStyle = c.strokeStyle; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let row = 0; row < h / cell + 2; row++) for (let col = 0; col < w / cell + 2; col++) {
      const x = col * cell + (row % 2 ? cell / 2 : 0) + rr(r, -12, 12), y = row * cell + rr(r, -12, 12);
      c.save(); c.translate(x, y); c.rotate(rr(r, -.45, .45)); const s = rr(r, .9, 1.3); c.scale(s, s); this.icon(c, Math.floor(r() * 10)); c.restore();
    }
  },
  space(c, w, h) {
    for (const [fx, fy, fr, col] of [[.2, .25, .55, 0x8E5CF7], [.85, .55, .5, 0xE84D8A], [.3, .85, .6, 0x2AA3E6]]) {
      const x = w * fx, y = h * fy, R = Math.max(w, h) * fr, g = c.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, css(col, .38)); g.addColorStop(1, css(col, 0)); c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    this.stars(c, w, h, 170, 1, 0xFFFFFF, 99);
    this.planet(c, w * .78, h * .16, 34, 0xFFB37A, 0xE0607E, 0x9FE8DE, -18);
    const mx = w * .16, my = h * .68, g = c.createLinearGradient(mx - 20, my - 20, mx + 20, my + 20);
    g.addColorStop(0, css(0xE8E6F0)); g.addColorStop(1, css(0x9C98B8)); c.fillStyle = g; c.beginPath(); c.arc(mx, my, 20, 0, 7); c.fill();
    c.fillStyle = css(0x7E7A9C, .6); for (const [dx, dy, cr] of [[-6, -5, 5], [7, 4, 4], [-2, 9, 3]]) { c.beginPath(); c.arc(mx + dx, my + dy, cr, 0, 7); c.fill(); }
    const tg = c.createLinearGradient(w * .42, h * .42, w * .6, h * .36); tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(255,255,255,.8)');
    c.strokeStyle = tg; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(w * .42, h * .42); c.lineTo(w * .6, h * .36); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w * .6, h * .36, 3, 0, 7); c.fill();
  }
};

function paintWall(canvas, index, dark) {
  const wall = WALLS[Math.min(Math.max(index, 0), WALLS.length - 1)];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = dark ? wall.dark : wall.light, g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(cols[0])); g.addColorStop(1, css(cols[1])); c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (wall.style) { c.save(); Paint[wall.style](c, w, h, dark); c.restore(); }
}

const defaultTheme = () => ({ mode: 0, accent: 0x2AA3E6, myBubble: null, myText: null, theirBubble: null, theirText: null, fontSize: 16, wallpaper: 0 });
let theme = (() => { try { return { ...defaultTheme(), ...JSON.parse(LS.get('theme') || '{}') }; } catch { return defaultTheme(); } })();
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => theme.mode === 2 || (theme.mode === 0 && darkQuery.matches);

function applyTheme() {
  const root = document.documentElement, dark = isDark();
  root.toggleAttribute('data-dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', toHex(theme.accent));
  root.style.setProperty('--fs', theme.fontSize + 'px');
  const setOpt = (name, v, meta) => {
    if (v == null) { root.style.removeProperty(name); if (meta) root.style.removeProperty(meta); }
    else { root.style.setProperty(name, toHex(v)); if (meta) root.style.setProperty(meta, css(v, .65)); }
  };
  setOpt('--my-bubble', theme.myBubble); setOpt('--my-text', theme.myText, '--my-meta');
  setOpt('--their-bubble', theme.theirBubble); setOpt('--their-text', theme.theirText, '--their-meta');
  $('meta[name=theme-color]').content = dark ? '#17212B' : '#F7F7F7';
  paintWall($('#wallpaper'), theme.wallpaper, dark);
}
function saveTheme() { LS.set('theme', JSON.stringify(theme)); applyTheme(); renderSettingsTheme(); }
addEventListener('resize', () => { clearTimeout(applyTheme.t); applyTheme.t = setTimeout(applyTheme, 120); });
darkQuery.addEventListener?.('change', applyTheme);

// ---------------------------------------------------------------- durum
const TTL_OPTIONS = [[0, 'Kapalı'], [30, '30 saniye'], [300, '5 dakika'], [3600, '1 saat'], [86400, '1 gün'], [604800, '1 hafta']];
const ttlLabel = v => (TTL_OPTIONS.find(o => o[0] === v) || [0, `${v} sn`])[1];
const MAX_LEN = 1500, MAX_MEDIA = 14500000;

const S = {
  config: null, messages: [], connected: false, relay: null,
  peerName: LS.get('peerName') || '', peerOnline: false, peerLastSeen: Number(LS.get('peerLastSeen')) || 0, peerTyping: false,
  ttl: Number(LS.get('ttl')) || 0, seen: new Set(), active: !document.hidden,
  lastTypingSent: 0, lastPresenceSent: 0, lastPeerPing: 0, lastReadSentTs: Number(LS.get('lastReadSentTs')) || 0,
  replying: null, editing: null, mediaURLs: new Map()
};
const displayPeer = () => S.peerName || 'Karşı taraf';

// ---------------------------------------------------------------- kayıt
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => vault.putJSON('messages', S.messages), 150); }
const saveConfig = () => vault.putJSON('config', S.config);

// ---------------------------------------------------------------- gönderme
function makeEnv(kind, body = '', id = uuid(), ts = nowS()) {
  return { id, from: S.config.deviceId, name: S.config.myName, kind, body, ts };
}
async function post(env, cache = true, keepalive = false) {
  if (!room.key || !S.relay) return false;
  try {
    let e = env, sealed = await room.seal(e);
    if (sealed.length > 3900 && e.media?.thumb) { e = { ...e, media: { ...e.media } }; delete e.media.thumb; sealed = await room.seal(e); }
    if (sealed.length > 4000) return false;
    await S.relay.publish(sealed, cache, keepalive);
    return true;
  } catch { return false; }
}
const fire = (env, cache = true) => { post(env, cache); };

function newOutgoing() {
  const t = nowS();
  const m = { id: uuid(), text: '', mine: true, date: t, status: 'sending', ts: t };
  if (S.ttl > 0) m.expiresAt = t + S.ttl;
  return m;
}
const byId = id => S.messages.find(m => m.id === id);
function setStatus(id, s) { const m = byId(id); if (!m || (m.status === 'read' && s === 'sent')) return; m.status = s; save(); render(); }
function setMedia(id, s) { const m = byId(id); if (!m) return; m.mediaState = s; save(); render(); }

function sendText(text, replyTo) {
  const t = text.trim().slice(0, MAX_LEN);
  if (!t) return;
  const m = newOutgoing(); m.text = t; if (replyTo) m.replyTo = replyTo;
  S.messages.push(m); save(); render(true); deliver(m);
}
async function deliver(m) {
  const env = makeEnv(m.media ? 'media' : 'text', m.text, m.id, m.ts || m.date);
  if (m.replyTo) env.replyTo = m.replyTo;
  if (m.media) env.media = m.media;
  if (m.expiresAt) env.ttl = Math.max(1, m.expiresAt - m.date);
  setStatus(m.id, (await post(env)) ? 'sent' : 'failed');
}
function editText(m, text) {
  const t = text.trim().slice(0, MAX_LEN);
  if (!m.mine || m.media || !t || t === m.text) return;
  m.text = t; m.edited = true; save(); render();
  const env = makeEnv('edit', t); env.target = m.id; fire(env);
}
function retry(m) {
  if (m.mine) {
    if (m.media && !m.media.url) upload(m.id);
    else if (m.status === 'failed') { setStatus(m.id, 'sending'); deliver(m); }
  } else if (m.media && m.mediaState === 'failed') download(m.id);
}

// ---------------------------------------------------------------- fotoğraf ve video
function loadImage(blob) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(); }; i.src = u; });
}
function drawScaled(img, max, w0 = img.naturalWidth || img.videoWidth, h0 = img.naturalHeight || img.videoHeight) {
  const s = Math.min(1, max / Math.max(w0, h0, 1)), w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); return c;
}
const canvasJPEG = (c, q) => new Promise(r => c.toBlob(b => r(b), 'image/jpeg', q));
async function thumbOf(img) { const c = drawScaled(img, 36); const b = await canvasJPEG(c, .35); return b ? b64(new Uint8Array(await b.arrayBuffer())) : undefined; }

async function sendImage(file) {
  try {
    const img = await loadImage(file);
    const c = drawScaled(img, 1600), blob = await canvasJPEG(c, .75);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const m = newOutgoing();
    m.media = { url: '', kind: 'image', size: bytes.length, w: c.width, h: c.height, thumb: await thumbOf(img) };
    m.localFile = m.id; m.mediaState = 'uploading';
    await vault.putBytes('media:' + m.id, bytes);
    S.mediaURLs.set(m.id, URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
    S.messages.push(m); save(); render(true); upload(m.id);
  } catch { toast('Fotoğraf açılamadı'); }
}
function videoInfo(file) {
  return new Promise(res => {
    const v = document.createElement('video'), u = URL.createObjectURL(file);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
    const done = (r) => { URL.revokeObjectURL(u); res(r); };
    v.onloadeddata = () => { v.currentTime = Math.min(.1, v.duration || 0); };
    v.onseeked = async () => { done({ w: v.videoWidth, h: v.videoHeight, dur: v.duration, poster: drawScaled(v, 720) }); };
    v.onerror = () => done({ w: 0, h: 0, dur: 0, poster: null });
    setTimeout(() => done({ w: v.videoWidth, h: v.videoHeight, dur: v.duration || 0, poster: null }), 6000);
  });
}
async function sendVideo(file) {
  if (file.size > MAX_MEDIA) { toast('Video çok büyük (en fazla ~14 MB). Daha kısa bir video seç.'); return; }
  toast('Video hazırlanıyor…', 1500);
  const info = await videoInfo(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const m = newOutgoing();
  let thumb;
  if (info.poster) {
    const pb = await canvasJPEG(info.poster, .7);
    if (pb) { const pu = new Uint8Array(await pb.arrayBuffer()); await vault.putBytes('poster:' + m.id, pu); S.mediaURLs.set('p:' + m.id, URL.createObjectURL(new Blob([pu], { type: 'image/jpeg' }))); }
    thumb = await thumbOf(info.poster);
  }
  m.media = { url: '', kind: 'video', size: bytes.length, w: info.w || undefined, h: info.h || undefined, dur: isFinite(info.dur) ? info.dur : undefined, thumb };
  m.localFile = m.id; m.mediaState = 'uploading'; m.mime = file.type || 'video/mp4';
  await vault.putBytes('media:' + m.id, bytes);
  S.messages.push(m); save(); render(true); upload(m.id);
}
async function upload(id) {
  const m = byId(id); if (!m || !room.key || !S.relay) return;
  setMedia(id, 'uploading'); setStatus(id, 'sending');
  try {
    const raw = await vault.getBytes('media:' + id); if (!raw) throw new Error('missing');
    const url = await S.relay.upload(await room.sealData(raw), room.mediaTopic);
    const mm = byId(id); if (!mm) return;
    mm.media.url = url; mm.mediaState = 'ready'; save(); render(); deliver(mm);
  } catch (e) {
    setMedia(id, 'failed'); setStatus(id, 'failed');
    toast(e.message === 'tooLarge' ? 'Dosya sunucu sınırını (15 MB) aşıyor' : 'Gönderilemedi, tekrar denemek için dokun');
  }
}
async function download(id) {
  const m = byId(id); if (!m?.media || !room.key || !S.relay) return;
  setMedia(id, 'downloading');
  try {
    const raw = await room.openData(await S.relay.download(m.media.url));
    await vault.putBytes('media:' + id, raw);
    const type = m.media.kind === 'video' ? 'video/mp4' : 'image/jpeg';
    S.mediaURLs.set(id, URL.createObjectURL(new Blob([raw], { type })));
    if (m.media.kind === 'video') {
      const info = await videoInfo(new Blob([raw], { type }));
      if (info.poster) { const pb = await canvasJPEG(info.poster, .7); if (pb) { const pu = new Uint8Array(await pb.arrayBuffer()); await vault.putBytes('poster:' + id, pu); S.mediaURLs.set('p:' + id, URL.createObjectURL(pb)); } }
    }
    const mm = byId(id); if (!mm) return;
    mm.localFile = id; mm.mediaState = 'ready'; save(); render();
  } catch (e) { setMedia(id, e.message === 'expired' ? 'expired' : 'failed'); }
}
async function mediaURL(m, poster = false) {
  const key = (poster ? 'p:' : '') + m.id;
  if (S.mediaURLs.has(key)) return S.mediaURLs.get(key);
  const bytes = await vault.getBytes((poster ? 'poster:' : 'media:') + m.id);
  if (!bytes) return null;
  const type = poster || m.media.kind !== 'video' ? 'image/jpeg' : (m.mime || 'video/mp4');
  const u = URL.createObjectURL(new Blob([bytes], { type }));
  S.mediaURLs.set(key, u); return u;
}

// ---------------------------------------------------------------- silme
async function removeMessage(id) {
  const i = S.messages.findIndex(m => m.id === id); if (i < 0) return;
  S.messages.splice(i, 1);
  await db.del('media:' + id); await db.del('poster:' + id);
  for (const k of [id, 'p:' + id]) { const u = S.mediaURLs.get(k); if (u) { URL.revokeObjectURL(u); S.mediaURLs.delete(k); } }
  save(); render();
}
const deleteForMe = m => removeMessage(m.id);
function deleteForAll(m) { removeMessage(m.id); const env = makeEnv('delete'); env.target = m.id; fire(env); }
async function clearLocal() {
  S.messages = []; save();
  await db.delPrefix('media:'); await db.delPrefix('poster:');
  for (const u of S.mediaURLs.values()) URL.revokeObjectURL(u); S.mediaURLs.clear();
  render();
}
function clearForAll() { clearLocal(); fire(makeEnv('clear')); }
function setTTL(v) {
  if (v === S.ttl) return;
  S.ttl = v; LS.set('ttl', v); fire(makeEnv('ttl', String(v)));
  appendSystem(v > 0 ? `Otomatik silme: ${ttlLabel(v)}` : 'Otomatik silme kapatıldı');
  renderHeader();
}
function appendSystem(text) {
  const t = nowS(); const m = { id: uuid(), text, mine: false, date: t, status: 'received', system: true, ts: t };
  if (S.ttl > 0) m.expiresAt = t + S.ttl;
  S.messages.push(m); save(); render(true);
}

// ---------------------------------------------------------------- çevrimiçi, yazıyor, okundu
function userTyping() {
  if (!S.config?.showPresence || Date.now() - S.lastTypingSent < 5000) return;
  S.lastTypingSent = Date.now(); fire(makeEnv('typing'), false);
}
function sendPresence(on, force) {
  if (!S.config || (!S.config.showPresence && on)) return;
  if (on && !force && Date.now() - S.lastPresenceSent < 40000) return;
  S.lastPresenceSent = on ? Date.now() : 0;
  post(makeEnv('presence', on ? 'on' : 'off'), false, !on);
}
function markPeerSeen() { S.peerOnline = true; S.lastPeerPing = Date.now(); S.peerLastSeen = nowS(); LS.set('peerLastSeen', S.peerLastSeen); renderHeader(); }
let readTimer = null;
function scheduleRead() {
  if (!S.active || !S.config?.readReceipts) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (!S.active || document.hidden) return;
    const max = Math.max(0, ...S.messages.filter(m => !m.mine && !m.system).map(m => m.ts || 0));
    if (max <= S.lastReadSentTs) return;
    S.lastReadSentTs = max; LS.set('lastReadSentTs', max); fire(makeEnv('read', String(max)));
  }, 800);
}
function lastSeenText(t) {
  const s = nowS() - t, d = new Date(t * 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (isToday(d)) return 'bugün ' + timeFmt.format(d);
  if (isYesterday(d)) return 'dün ' + timeFmt.format(d);
  return shortFmt.format(d);
}
function peerStatus() {
  if (!S.connected) return 'bağlanıyor…';
  if (S.peerTyping) return 'yazıyor…';
  if (!S.config?.showPresence) return 'uçtan uca şifreli';
  if (S.peerOnline) return 'çevrimiçi';
  return S.peerLastSeen ? 'son görülme ' + lastSeenText(S.peerLastSeen) : 'uçtan uca şifreli';
}

setInterval(() => {
  if (!S.config) return;
  if (S.active) sendPresence(true, false);
  if (S.peerOnline && Date.now() - S.lastPeerPing > 70000) { S.peerOnline = false; S.peerTyping = false; }
  const t = nowS(), expired = S.messages.filter(m => m.expiresAt && m.expiresAt <= t);
  for (const m of expired) removeMessage(m.id);
  renderHeader();
}, 5000);

// ---------------------------------------------------------------- alma
function startRelay() {
  S.relay?.stop(); S.relay = null; S.connected = false;
  if (!S.config || !room.key) return;
  const since = LS.get('since-' + room.topic) || '12h';
  const r = new Relay(S.config.server || 'https://ntfy.sh', room.topic, since);
  r.onState = ok => { const was = S.connected; S.connected = ok; if (ok && !was) sendPresence(true, true); renderHeader(); };
  r.onMessage = (id, body) => receive(id, body);
  S.relay = r; r.start(); renderHeader();
}
let notifyCount = 0;
function notify(title, body) {
  if (!S.config?.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, icon: 'icon-192.png', tag: 'pikku' }); n.onclick = () => { focus(); n.close(); }; } catch {}
  notifyCount++; document.title = `(${notifyCount}) Pikku`;
}

async function receive(id, body) {
  LS.set('since-' + room.topic, id);
  const env = await room.open(body);
  if (!env || !S.config || env.from === S.config.deviceId || S.seen.has(env.id)) return;
  S.seen.add(env.id);
  if (env.name && env.name !== S.peerName) { S.peerName = env.name; LS.set('peerName', env.name); }
  const age = nowS() - env.ts;
  switch (env.kind) {
    case 'text': case 'media': {
      if (byId(env.id)) return;
      const m = { id: env.id, text: env.body || '', mine: false, date: env.ts, status: 'received', ts: env.ts };
      if (env.replyTo) m.replyTo = env.replyTo;
      if (env.ttl > 0) { m.expiresAt = env.ts + env.ttl; if (m.expiresAt <= nowS()) return; }
      if (env.media) { m.media = env.media; m.mediaState = 'downloading'; }
      S.peerTyping = false;
      S.messages.push(m);
      if (S.messages.length > 1 && S.messages[S.messages.length - 2].date > m.date) S.messages.sort((a, b) => a.date - b.date);
      save(); render(true);
      if (m.media) download(m.id);
      if (age < 120) markPeerSeen();
      notify(displayPeer(), m.media ? (m.media.kind === 'video' ? 'Video' : 'Fotoğraf') : 'Yeni mesaj');
      scheduleRead();
      break;
    }
    case 'edit': { const m = byId(env.target); if (m && !m.mine) { m.text = String(env.body).slice(0, MAX_LEN); m.edited = true; save(); render(); } break; }
    case 'delete': if (env.target) removeMessage(env.target); break;
    case 'clear': await clearLocal(); appendSystem(`${displayPeer()} sohbeti temizledi`); break;
    case 'ttl': { const v = Number(env.body) || 0; S.ttl = v; LS.set('ttl', v); appendSystem(v > 0 ? `${displayPeer()} otomatik silmeyi ${ttlLabel(v)} yaptı` : `${displayPeer()} otomatik silmeyi kapattı`); break; }
    case 'read': {
      const upTo = Number(env.body) || 0; let ch = false;
      for (const m of S.messages) if (m.mine && m.status === 'sent' && (m.ts ?? Infinity) <= upTo) { m.status = 'read'; ch = true; }
      if (ch) { save(); render(); }
      break;
    }
    case 'presence':
      if (age >= 90) return;
      if (env.body === 'on') { const was = S.peerOnline; markPeerSeen(); if (!was && S.active) sendPresence(true, true); }
      else { S.peerOnline = false; S.peerTyping = false; S.peerLastSeen = env.ts; LS.set('peerLastSeen', env.ts); }
      break;
    case 'typing':
      if (age >= 10) return;
      markPeerSeen(); S.peerTyping = true; clearTimeout(receive.typing);
      receive.typing = setTimeout(() => { S.peerTyping = false; renderHeader(); }, 6000);
      break;
    case 'screenshot': appendSystem(`${displayPeer()} ekran görüntüsü aldı`); break;
    case 'offer': case 'answer': case 'hangup': case 'reject': case 'busy': Call.handle(env); break;
  }
  renderHeader();
}

// ---------------------------------------------------------------- arama (WebRTC)
const Call = {
  state: 'idle', video: false, id: '', pc: null, local: null, pendingOffer: null, muted: false, camOff: false, facing: 'user',
  startedAt: 0, reconnecting: false, timeout: null, tick: null, ring: null,
  iceServers() {
    const s = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
    const t = (S.config?.turnURL || '').trim();
    if (t) s.push({ urls: [t], username: S.config.turnUser, credential: S.config.turnPass });
    return s;
  },
  async signal(kind, body, id) {
    const env = makeEnv(kind, body); env.video = this.video; env.callId = id;
    if (await post(env)) return true;
    await sleep(1500); return post(env);
  },
  log(t) { appendSystem(t); },
  kindName() { return this.video ? 'Görüntülü arama' : 'Sesli arama'; },
  summary() { return this.startedAt ? `${this.kindName()} · ${durText(nowS() - this.startedAt)}` : `${this.kindName()} iptal edildi`; },

  async start(video) {
    if (this.state !== 'idle' || !S.config) return;
    this.id = uuid(); this.video = video; this.reset(); this.set('outgoing');
    const id = this.id;
    try {
      await this.makePeer();
      if (this.state !== 'outgoing' || this.id !== id) return;
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gather();
      if (this.state !== 'outgoing' || this.id !== id) return;
      const ok = await this.signal('offer', this.pc.localDescription.sdp, id);
      if (this.state !== 'outgoing' || this.id !== id) return;
      if (!ok) { this.log('Arama gönderilemedi — internet bağlantısını kontrol et'); return this.cleanup(); }
      this.timeout = setTimeout(() => { if (this.state === 'outgoing' && this.id === id) this.end('hangup', 'Cevap verilmedi'); }, 45000);
    } catch (e) {
      this.log(e?.name === 'NotAllowedError' ? 'Mikrofon/kamera izni verilmedi' : 'Arama başlatılamadı');
      this.cleanup();
    }
  },
  handle(env) {
    const age = nowS() - env.ts;
    switch (env.kind) {
      case 'offer':
        if (age >= 40) { this.video = !!env.video; return this.log(env.video ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama'); }
        if (this.state !== 'idle') { if (env.callId && env.callId !== this.id) { const e2 = makeEnv('busy'); e2.callId = env.callId; e2.video = false; fire(e2); } return; }
        this.id = env.callId || uuid(); this.pendingOffer = env.body; this.video = !!env.video; this.reset(); this.set('incoming'); this.startRing();
        notify(displayPeer(), this.video ? 'Görüntülü arama geliyor' : 'Sesli arama geliyor');
        { const id = this.id; this.timeout = setTimeout(() => { if (this.state === 'incoming' && this.id === id) { this.log(this.video ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama'); this.cleanup(); } }, 45000); }
        break;
      case 'answer':
        if (this.state !== 'outgoing' || env.callId !== this.id) return;
        clearTimeout(this.timeout); this.set('connecting');
        this.pc.setRemoteDescription({ type: 'answer', sdp: env.body }).catch(() => this.end('hangup', 'Bağlantı kurulamadı'));
        break;
      case 'hangup': case 'reject': case 'busy':
        if (env.callId !== this.id || this.state === 'idle') return;
        this.log(env.kind === 'reject' ? 'Arama reddedildi' : env.kind === 'busy' ? 'Karşı taraf başka bir görüşmede'
          : this.state === 'incoming' ? (this.video ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama') : this.summary());
        this.cleanup();
        break;
    }
  },
  async accept() {
    if (this.state !== 'incoming' || !this.pendingOffer) return;
    this.stopRing(); clearTimeout(this.timeout); this.set('connecting');
    const id = this.id;
    try {
      await this.makePeer();
      await this.pc.setRemoteDescription({ type: 'offer', sdp: this.pendingOffer });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.gather();
      if (this.id !== id || this.state === 'idle') return;
      if (!(await this.signal('answer', this.pc.localDescription.sdp, id)) && this.id === id) this.end(null, 'Bağlantı kurulamadı');
    } catch (e) {
      this.end(e?.name === 'NotAllowedError' ? 'reject' : 'hangup', e?.name === 'NotAllowedError' ? 'Mikrofon/kamera izni verilmedi' : 'Bağlantı kurulamadı');
    }
  },
  reject() { if (this.state === 'incoming') this.end('reject', 'Arama reddedildi'); },
  hangup() { if (this.state !== 'idle') this.end('hangup', this.state === 'outgoing' ? 'Arama iptal edildi' : this.summary()); },
  end(notifyKind, text) {
    if (notifyKind) { const e = makeEnv(notifyKind); e.video = this.video; e.callId = this.id; fire(e); }
    if (text) this.log(text);
    this.cleanup();
  },
  async makePeer() {
    this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: this.video ? { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false });
    const pc = new RTCPeerConnection({ iceServers: this.iceServers(), bundlePolicy: 'max-bundle' });
    this.pc = pc;
    for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    if (this.video) { const lv = $('#localVideo'); lv.srcObject = this.local; lv.hidden = false; }
    pc.ontrack = ev => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      $('#remoteAudio').srcObject = stream; $('#remoteAudio').play().catch(() => {});
      if (this.video) { const rv = $('#remoteVideo'); rv.srcObject = stream; rv.play().catch(() => {}); }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        this.reconnecting = false;
        if (this.state !== 'active') { this.state = 'active'; this.startedAt = nowS(); }
        this.render();
      } else if (s === 'disconnected') { if (this.state === 'active') { this.reconnecting = true; this.render(); } }
      else if (s === 'failed') this.end('hangup', this.state === 'active' ? 'Bağlantı koptu' : 'Bağlantı kurulamadı (ağ engeli olabilir, Ayarlar\'dan TURN ekleyebilirsin)');
    };
  },
  gather() {
    const pc = this.pc;
    if (!pc || pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(res, 4000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  },
  toggleMute() { this.muted = !this.muted; this.local?.getAudioTracks().forEach(t => t.enabled = !this.muted); this.render(); },
  toggleCam() { this.camOff = !this.camOff; this.local?.getVideoTracks().forEach(t => t.enabled = !this.camOff); this.render(); },
  async flip() {
    if (!this.local || !this.video) return;
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const nt = ns.getVideoTracks()[0], old = this.local.getVideoTracks()[0];
      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
      await sender?.replaceTrack(nt);
      if (old) { this.local.removeTrack(old); old.stop(); }
      this.local.addTrack(nt); nt.enabled = !this.camOff;
      $('#localVideo').srcObject = this.local;
    } catch { this.facing = this.facing === 'user' ? 'environment' : 'user'; toast('Kamera değiştirilemedi'); }
    this.render();
  },
  reset() { this.muted = false; this.camOff = false; this.facing = 'user'; this.reconnecting = false; this.startedAt = 0; },
  set(s) { this.state = s; this.render(); },
  cleanup() {
    this.stopRing(); clearTimeout(this.timeout);
    this.local?.getTracks().forEach(t => t.stop()); this.local = null;
    try { this.pc?.close(); } catch {} this.pc = null;
    for (const sel of ['#remoteVideo', '#localVideo', '#remoteAudio']) { const el = $(sel); el.srcObject = null; }
    this.pendingOffer = null; this.startedAt = 0; this.reconnecting = false; this.state = 'idle'; this.render();
  },
  startRing() {
    this.stopRing();
    const beep = () => {
      try {
        const ac = this.ac ||= new (window.AudioContext || window.webkitAudioContext)();
        ac.resume?.();
        for (const [f, at] of [[880, 0], [660, .25], [880, .5]]) {
          const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0, ac.currentTime + at); g.gain.linearRampToValueAtTime(.18, ac.currentTime + at + .02); g.gain.linearRampToValueAtTime(0, ac.currentTime + at + .2);
          o.connect(g).connect(ac.destination); o.start(ac.currentTime + at); o.stop(ac.currentTime + at + .22);
        }
      } catch {}
      navigator.vibrate?.([300, 200, 300]);
    };
    beep(); this.ring = setInterval(beep, 2500);
  },
  stopRing() { clearInterval(this.ring); this.ring = null; },
  render() {
    const el = $('#call');
    el.hidden = this.state === 'idle';
    clearInterval(this.tick);
    if (this.state === 'idle') { $('#remoteVideo').hidden = true; $('#localVideo').hidden = true; return; }
    const name = displayPeer();
    $('#callName').textContent = name; $('#callAvatar').textContent = (name[0] || '?').toUpperCase();
    const remoteOn = this.video && this.state === 'active';
    $('#remoteVideo').hidden = !remoteOn; el.classList.toggle('video-on', remoteOn);
    $('#localVideo').hidden = !this.video || this.camOff || !this.local;
    $('#localVideo').classList.toggle('back', this.facing !== 'user');
    const status = () => {
      switch (this.state) {
        case 'incoming': return this.video ? 'Görüntülü arama geliyor…' : 'Sesli arama geliyor…';
        case 'outgoing': return 'Çalıyor…';
        case 'connecting': return 'Bağlanıyor…';
        case 'active': return this.reconnecting ? 'Yeniden bağlanıyor…' : durText(nowS() - this.startedAt);
      }
      return '';
    };
    $('#callStatus').textContent = status();
    if (this.state === 'active') this.tick = setInterval(() => { $('#callStatus').textContent = status(); }, 1000);
    const btn = (icon, label, cls, fn) => { const b = document.createElement('button'); b.className = 'cbtn ' + (cls || ''); b.innerHTML = `<span>${icon}</span>${label}`; b.onclick = fn; return b; };
    const c = $('#callControls'); c.innerHTML = ''; c.classList.toggle('incoming', this.state === 'incoming');
    if (this.state === 'incoming') {
      c.append(btn(ICON.hang, 'Reddet', 'red', () => this.reject()), btn(this.video ? ICON.video : ICON.phone, 'Kabul et', 'green', () => this.accept()));
    } else {
      c.append(btn(this.muted ? ICON.micOff : ICON.mic, 'Sessiz', this.muted ? 'on' : '', () => this.toggleMute()));
      if (this.video) c.append(btn(this.camOff ? ICON.videoOff : ICON.video, 'Kamera', this.camOff ? 'on' : '', () => this.toggleCam()), btn(ICON.flip, 'Çevir', '', () => this.flip()));
      c.append(btn(ICON.hang, 'Bitir', 'red', () => this.hangup()));
    }
  }
};
addEventListener('beforeunload', () => { if (Call.state !== 'idle') { const e = makeEnv('hangup'); e.callId = Call.id; e.video = Call.video; post(e, true, true); } sendPresence(false, true); });

// ---------------------------------------------------------------- görünüm: sohbet
const msgEl = $('#messages');
function nearBottom() { return msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 120; }
function scrollEnd() { msgEl.scrollTop = msgEl.scrollHeight; }

function statusIcon(m) {
  if (!m.mine) return '';
  return { sending: ICON.clock, sent: ICON.check, read: ICON.checks, failed: ICON.fail }[m.status] || '';
}
function metaHTML(m) {
  return `<span class="meta">${m.expiresAt ? ICON.timer : ''}${m.edited ? 'düzenlendi ' : ''}${timeFmt.format(new Date(m.date * 1000))}${statusIcon(m)}</span>`;
}
function quoteHTML(m) {
  if (!m.replyTo) return '';
  const r = byId(m.replyTo);
  const who = r ? (r.mine ? 'Sen' : displayPeer()) : 'Mesaj';
  const what = r ? (r.media ? (r.media.kind === 'video' ? 'Video' : 'Fotoğraf') : r.text) : 'Silinmiş mesaj';
  return `<div class="quote" data-jump="${esc(m.replyTo)}"><div class="quote-bar"></div><div><div class="quote-name">${esc(who)}</div><div class="quote-text">${esc(what)}</div></div></div>`;
}
function mediaSize(info) {
  const w = info.w || 0, h = info.h || 0, max = Math.min(260, innerWidth * .62);
  if (!w || !h) return [max, max];
  let W = max, H = W * h / w; if (H > 320) { H = 320; W = H * w / h; }
  return [Math.max(W, 120), Math.max(H, 90)];
}
function mediaHTML(m) {
  const info = m.media, [W, H] = mediaSize(info), video = info.kind === 'video';
  const ph = info.thumb ? `<img class="ph" alt="" src="data:image/jpeg;base64,${info.thumb}">` : '';
  let center = '';
  if (m.mediaState === 'uploading' || m.mediaState === 'downloading') center = '<span><i class="spinner"></i></span>';
  else if (m.mediaState === 'failed') center = `<span>${m.mine ? ICON.up : ICON.down}</span>`;
  else if (m.mediaState === 'expired') center = '<span class="label">Süresi doldu</span>';
  else if (video) center = `<span>${ICON.play}</span>`;
  const real = m.mediaState === 'ready' ? `<img class="real" alt="" data-media="${esc(m.id)}" data-poster="${video ? 1 : ''}" hidden>` : '';
  return `<div class="media-wrap" style="width:${W | 0}px;height:${H | 0}px">${ph}${real}${video && info.dur ? `<span class="media-dur">${durText(info.dur)}</span>` : ''}<div class="media-center">${center}</div><span class="media-meta">${m.expiresAt ? ICON.timer : ''}${timeFmt.format(new Date(m.date * 1000))}${statusIcon(m)}</span></div>`;
}
function render(stick) {
  const keep = stick || nearBottom();
  const parts = [];
  if (!S.messages.length) parts.push('<div class="empty"><b>Henüz mesaj yok</b>Karşı taraf aynı eşleşme koduyla giriş yaptığında mesajlarınız birbirine ulaşır.</div>');
  let prev = null;
  for (const m of S.messages) {
    const d = new Date(m.date * 1000);
    if (!prev || !sameDay(prev, d)) parts.push(`<div class="day">${isToday(d) ? 'Bugün' : isYesterday(d) ? 'Dün' : dayFmt.format(d)}</div>`);
    prev = d;
    if (m.system) { parts.push(`<div class="sys" data-id="${esc(m.id)}">${esc(m.text)} · ${timeFmt.format(d)}</div>`); continue; }
    const inner = m.media ? quoteHTML(m) + mediaHTML(m) : `${quoteHTML(m)}<div class="text">${esc(m.text)}${metaHTML(m)}</div>`;
    parts.push(`<div class="row ${m.mine ? 'mine' : 'theirs'}" id="m-${esc(m.id)}"><div class="bubble${m.media ? ' media' : ''}" data-id="${esc(m.id)}">${inner}</div></div>`);
  }
  msgEl.innerHTML = parts.join('');
  msgEl.querySelectorAll('img.real').forEach(async img => {
    const m = byId(img.dataset.media); if (!m) return;
    const u = await mediaURL(m, !!img.dataset.poster);
    if (u) { img.src = u; img.hidden = false; img.previousElementSibling?.classList?.contains('ph') && (img.previousElementSibling.hidden = true); }
  });
  if (keep) scrollEnd();
}
function renderHeader() {
  const name = S.peerName || 'Pikku';
  $('#peerName').textContent = name; $('#peerAvatar').textContent = (name[0] || '?').toUpperCase();
  const st = $('#peerStatus'); st.textContent = peerStatus(); st.classList.toggle('on', S.connected && (S.peerOnline || S.peerTyping) && !!S.config?.showPresence);
  $('#ttlIcon').hidden = !(S.ttl > 0);
}

// Etkileşim: dokunma, sağ tık / uzun basma menüsü
msgEl.addEventListener('click', e => {
  const q = e.target.closest('.quote'); if (q) { const t = $('#m-' + CSS.escape(q.dataset.jump)); t?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const b = e.target.closest('.bubble'); if (!b) return;
  const m = byId(b.dataset.id); if (!m) return;
  if (m.media && m.mediaState === 'ready') openViewer(m);
  else if (m.status === 'failed' || m.mediaState === 'failed') retry(m);
});
msgEl.addEventListener('contextmenu', e => {
  const b = e.target.closest('.bubble, .sys'); if (!b) return;
  e.preventDefault(); openMenu(byId(b.dataset.id), e.clientX, e.clientY);
});
let pressT = null;
msgEl.addEventListener('touchstart', e => {
  const b = e.target.closest('.bubble, .sys'); if (!b) return;
  const t = e.touches[0];
  pressT = setTimeout(() => { navigator.vibrate?.(15); openMenu(byId(b.dataset.id), t.clientX, t.clientY); }, 480);
}, { passive: true });
for (const ev of ['touchend', 'touchmove', 'touchcancel']) msgEl.addEventListener(ev, () => clearTimeout(pressT), { passive: true });

function openMenu(m, x, y) {
  if (!m) return;
  const menu = $('#menu'), items = [];
  if (!m.system) {
    items.push(['Yanıtla', () => { S.replying = m; S.editing = null; updateContext(); $('#input').focus(); }]);
    if (m.text) items.push(['Kopyala', () => navigator.clipboard?.writeText(m.text).then(() => toast('Kopyalandı')).catch(() => {})]);
    if (m.mine && !m.media && m.status !== 'failed') items.push(['Düzenle', () => { S.editing = m; S.replying = null; $('#input').value = m.text; autosize(); updateContext(); $('#input').focus(); }]);
    if (m.status === 'failed' || m.mediaState === 'failed') items.push(['Tekrar dene', () => retry(m)]);
  }
  items.push(['Benden sil', () => deleteForMe(m), true]);
  if (!m.system) items.push(['Herkesten sil', () => deleteForAll(m), true]);
  menu.innerHTML = '';
  for (const [label, fn, danger] of items) { const b = document.createElement('button'); b.textContent = label; if (danger) b.className = 'danger'; b.onclick = () => { closeMenu(); fn(); }; menu.append(b); }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(Math.max(8, x), innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(Math.max(8, y), innerHeight - r.height - 8) + 'px';
}
function closeMenu() { $('#menu').hidden = true; }
document.addEventListener('pointerdown', e => { if (!$('#menu').hidden && !e.target.closest('#menu')) closeMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeViewer(); } });

// Yazma alanı
const input = $('#input');
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; $('#sendBtn').disabled = !input.value.trim(); }
input.addEventListener('input', () => { autosize(); if (input.value) userTyping(); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } });
$('#sendBtn').onclick = send;
function send() {
  const v = input.value; if (!v.trim()) return;
  if (S.editing) { editText(S.editing, v); S.editing = null; } else { sendText(v, S.replying?.id); S.replying = null; }
  input.value = ''; autosize(); updateContext(); input.focus();
}
function updateContext() {
  const bar = $('#contextBar'), m = S.editing || S.replying;
  bar.hidden = !m; if (!m) return;
  $('#contextTitle').textContent = S.editing ? 'Düzenleniyor' : (m.mine ? 'Kendi mesajına yanıt' : `${displayPeer()} yanıtlanıyor`);
  $('#contextBody').textContent = m.media ? (m.media.kind === 'video' ? 'Video' : 'Fotoğraf') : m.text;
}
$('#contextClose').onclick = () => { if (S.editing) input.value = ''; S.editing = null; S.replying = null; autosize(); updateContext(); };
$('#fileInput').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.type.startsWith('video/')) sendVideo(f); else if (f.type.startsWith('image/')) sendImage(f); else toast('Yalnızca fotoğraf ve video gönderilebilir');
};
$('#videoCallBtn').onclick = () => Call.start(true);
$('#voiceCallBtn').onclick = () => Call.start(false);

// Görüntüleyici
async function openViewer(m) {
  const u = await mediaURL(m); if (!u) return;
  const body = $('#viewerBody'); body.innerHTML = '';
  const el = document.createElement(m.media.kind === 'video' ? 'video' : 'img');
  el.src = u; if (m.media.kind === 'video') { el.controls = true; el.autoplay = true; el.playsInline = true; }
  body.append(el);
  const a = $('#viewerSave'); a.href = u; a.download = `pikku-${m.id.slice(0, 8)}.${m.media.kind === 'video' ? 'mp4' : 'jpg'}`;
  $('#viewer').hidden = false;
}
function closeViewer() { const v = $('#viewer'); if (v.hidden) return; v.hidden = true; $('#viewerBody').innerHTML = ''; }
$('#viewerClose').onclick = closeViewer;

// Bildirim ve iletişim kutusu
function toast(text, ms = 3200) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function confirmBox(text, label, fn) {
  $('#dialogText').textContent = text;
  const a = $('#dialogActions'); a.innerHTML = '';
  const ok = document.createElement('button'); ok.className = 'danger'; ok.textContent = label; ok.onclick = () => { $('#dialog').hidden = true; fn(); };
  const no = document.createElement('button'); no.textContent = 'Vazgeç'; no.onclick = () => { $('#dialog').hidden = true; };
  a.append(ok, no); $('#dialog').hidden = false;
}

// ---------------------------------------------------------------- ayarlar
let draft = null, codeShown = false, themeBackup = null;
const THEME_KEYS = ['mode', 'accent', 'myBubble', 'myText', 'theirBubble', 'theirText', 'wallpaper'];
const isClassic = () => { const d = defaultTheme(); return THEME_KEYS.every(k => theme[k] === d[k]); };
const presetActive = i => { const p = WALLS[i]?.preset; return !!p && theme.wallpaper === i && ['mode', 'accent', 'myBubble', 'myText', 'theirBubble', 'theirText'].every(k => theme[k] === p[k]); };
function resetTheme() { const d = defaultTheme(); for (const k of THEME_KEYS) theme[k] = d[k]; saveTheme(); renderSettingsTheme(true); }
function openSettings() {
  draft = { ...S.config }; themeBackup = { ...theme };
  $('#sName').value = draft.myName; $('#sPresence').checked = draft.showPresence; $('#sRead').checked = draft.readReceipts;
  $('#sNotify').checked = !!draft.notify && 'Notification' in window && Notification.permission === 'granted';
  $('#sServer').value = draft.server; $('#sTurn').value = draft.turnURL; $('#sTurnUser').value = draft.turnUser; $('#sTurnPass').value = draft.turnPass;
  const sel = $('#sTTL'); sel.innerHTML = TTL_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); sel.value = String(S.ttl);
  codeShown = false; $('#sCode').textContent = '••••-••••-••••-••••'; $('#showCode').textContent = 'Göster';
  $('#settings').hidden = false; renderSettingsTheme(true);
}
function renderSettingsTheme(full) {
  if ($('#settings').hidden) return;
  const dark = isDark();
  document.querySelectorAll('#sMode button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === theme.mode));
  $('#sFont').value = theme.fontSize; $('#fontVal').textContent = theme.fontSize;
  const cs = getComputedStyle(document.documentElement), rgbHex = v => { v = v.trim(); if (v.startsWith('#')) return v.length === 7 ? v : '#000000'; const m = v.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : '#000000'; };
  $('#cMyBubble').value = rgbHex(cs.getPropertyValue('--my-bubble')); $('#cMyText').value = rgbHex(cs.getPropertyValue('--my-text'));
  $('#cTheirBubble').value = rgbHex(cs.getPropertyValue('--their-bubble')); $('#cTheirText').value = rgbHex(cs.getPropertyValue('--their-text'));
  $('#accentRow').innerHTML = ACCENTS.map(h => `<button class="swatch${h === theme.accent ? ' on' : ''}" style="background:${toHex(h)}" data-h="${h}" aria-label="Vurgu rengi"></button>`).join('');
  if (full) {
    $('#themeCards').innerHTML = '<button class="theme-card" data-i="-1"><canvas></canvas>Klasik</button>' + WALLS.map((w, i) => w.preset ? `<button class="theme-card" data-i="${i}"><canvas></canvas>${esc(w.name)}</button>` : '').join('');
    $('#wallRow').innerHTML = WALLS.map((w, i) => w.preset ? '' : `<button class="wall" data-i="${i}"><canvas></canvas>${esc(w.name)}</button>`).join('');
    let pv = $('#colorPreview canvas'); if (!pv) { pv = document.createElement('canvas'); $('#colorPreview').prepend(pv); }
  }
  document.querySelectorAll('#themeCards .theme-card').forEach(b => {
    const i = +b.dataset.i;
    if (i < 0) { b.classList.toggle('on', isClassic()); paintWall(b.querySelector('canvas'), 0, darkQuery.matches); return; }
    b.classList.toggle('on', presetActive(i));
    paintWall(b.querySelector('canvas'), i, WALLS[i].preset.mode === 1 ? false : WALLS[i].preset.mode === 2 ? true : dark);
  });
  document.querySelectorAll('#wallRow .wall').forEach(b => { const i = +b.dataset.i; b.classList.toggle('on', i === theme.wallpaper); paintWall(b.querySelector('canvas'), i, dark); });
  paintWall($('#colorPreview canvas'), theme.wallpaper, dark);
}
$('#openSettings').onclick = openSettings;
$('#settingsCancel').onclick = () => { if (themeBackup) { theme = { ...themeBackup }; LS.set('theme', JSON.stringify(theme)); applyTheme(); } $('#settings').hidden = true; };
$('#settingsSave').onclick = async () => {
  const n = { ...draft };
  n.myName = $('#sName').value.trim() || S.config.myName;
  n.showPresence = $('#sPresence').checked; n.readReceipts = $('#sRead').checked; n.notify = $('#sNotify').checked;
  n.server = $('#sServer').value.trim() || 'https://ntfy.sh';
  try { new URL(n.server); } catch { n.server = 'https://ntfy.sh'; }
  n.turnURL = $('#sTurn').value.trim(); n.turnUser = $('#sTurnUser').value.trim(); n.turnPass = $('#sTurnPass').value;
  const serverChanged = n.server !== S.config.server, presenceOff = S.config.showPresence && !n.showPresence;
  if (presenceOff) sendPresence(false, true);
  S.config = n; await saveConfig();
  if (serverChanged) startRelay();
  if (n.showPresence) sendPresence(true, true);
  $('#settings').hidden = true; renderHeader();
};
$('#sNotify').onchange = async e => {
  if (!e.target.checked) return;
  if (!('Notification' in window)) { e.target.checked = false; return toast('Bu tarayıcı bildirimleri desteklemiyor'); }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { e.target.checked = false; toast('Bildirim izni verilmedi'); }
};
$('#sTTL').onchange = e => setTTL(Number(e.target.value));
$('#sMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; theme.mode = Number(b.dataset.v); saveTheme(); renderSettingsTheme(true); };
$('#accentRow').onclick = e => { const b = e.target.closest('.swatch'); if (!b) return; theme.accent = Number(b.dataset.h); saveTheme(); };
$('#themeCards').onclick = e => {
  const b = e.target.closest('.theme-card'); if (!b) return;
  const i = +b.dataset.i;
  if (i < 0) return resetTheme();
  const p = WALLS[i].preset;
  Object.assign(theme, { wallpaper: i, mode: p.mode, accent: p.accent, myBubble: p.myBubble, myText: p.myText, theirBubble: p.theirBubble, theirText: p.theirText });
  saveTheme(); renderSettingsTheme(true);
};
$('#wallRow').onclick = e => {
  const b = e.target.closest('.wall'); if (!b) return;
  // Hazır temadan düz arka plana geçerken temanın renkleri de bırakılır
  if (WALLS[theme.wallpaper]?.preset) { const d = defaultTheme(); for (const k of ['mode', 'accent', 'myBubble', 'myText', 'theirBubble', 'theirText']) theme[k] = d[k]; }
  theme.wallpaper = +b.dataset.i; saveTheme(); renderSettingsTheme(true);
};
$('#sFont').oninput = e => { theme.fontSize = Number(e.target.value); saveTheme(); };
for (const [id, key] of [['#cMyBubble', 'myBubble'], ['#cMyText', 'myText'], ['#cTheirBubble', 'theirBubble'], ['#cTheirText', 'theirText']]) {
  $(id).oninput = e => { theme[key] = fromHex(e.target.value); LS.set('theme', JSON.stringify(theme)); applyTheme(); };
}
$('#resetColors').onclick = resetTheme;
$('#showCode').onclick = () => { codeShown = !codeShown; $('#sCode').textContent = codeShown ? S.config.code : '••••-••••-••••-••••'; $('#showCode').textContent = codeShown ? 'Gizle' : 'Göster'; };
$('#copyCode2').onclick = () => navigator.clipboard?.writeText(S.config.code).then(() => toast('Kopyalandı')).catch(() => {});
$('#clearAll').onclick = () => confirmBox('Tüm mesajlar iki cihazdan da silinsin mi?', 'İki taraftan da sil', clearForAll);
$('#clearMe').onclick = () => confirmBox('Tüm mesajlar yalnızca bu cihazdan silinsin mi?', 'Benden sil', clearLocal);
$('#resetPair').onclick = () => confirmBox('Eşleşme, anahtar ve tüm mesajlar bu cihazdan silinsin mi?', 'Sıfırla', async () => {
  sendPresence(false, true); S.relay?.stop(); S.relay = null;
  await clearLocal(); await db.del('config'); await db.del('room');
  for (const k of ['peerName', 'peerLastSeen', 'ttl', 'lastReadSentTs']) LS.del(k);
  location.reload();
});

// ---------------------------------------------------------------- kurulum ekranı
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(16));
  return [0, 1, 2, 3].map(g => [0, 1, 2, 3].map(i => chars[r[g * 4 + i] % chars.length]).join('')).join('-');
}
function setupValid() {
  const ok = normalize($('#setupCode').value).length >= 12;
  $('#codeError').hidden = ok || !$('#setupCode').value;
  $('#startBtn').disabled = !ok || !$('#setupName').value.trim();
}
$('#setupName').oninput = setupValid; $('#setupCode').oninput = setupValid;
$('#genCode').onclick = () => { $('#setupCode').value = randomCode(); setupValid(); };
$('#copyCode').onclick = () => { const v = $('#setupCode').value; if (v) navigator.clipboard?.writeText(v).then(() => toast('Kopyalandı')).catch(() => {}); };
$('#startBtn').onclick = async () => {
  const btn = $('#startBtn'); btn.disabled = true; btn.textContent = 'Anahtar oluşturuluyor…';
  const code = $('#setupCode').value.trim().toUpperCase();
  try {
    const r = await deriveRoom(code);
    await db.set('room', r);
    Object.assign(room, r);
    S.config = { myName: $('#setupName').value.trim(), code, server: 'https://ntfy.sh', deviceId: uuid(), turnURL: '', turnUser: '', turnPass: '', showPresence: true, readReceipts: true, notify: false };
    await saveConfig();
    showChat(); startRelay();
  } catch { toast('Bu tarayıcı gerekli şifrelemeyi desteklemiyor'); btn.disabled = false; btn.textContent = 'Başla'; }
};

// ---------------------------------------------------------------- yaşam döngüsü
function showChat() { $('#setup').hidden = true; $('#chat').hidden = false; renderHeader(); render(true); }
document.addEventListener('visibilitychange', () => {
  S.active = !document.hidden;
  if (!S.config) return;
  if (S.active) { notifyCount = 0; document.title = 'Pikku'; S.relay?.reconnect(); sendPresence(true, true); scheduleRead(); }
  else { sendPresence(false, true); S.peerTyping = false; }
});

(async function boot() {
  applyTheme();
  if (!window.crypto?.subtle || !window.CompressionStream) {
    $('#setup').hidden = false; toast('Tarayıcın çok eski. Güncel Safari, Chrome veya Firefox kullan.', 10000); return;
  }
  await vault.init();
  const cfg = await vault.getJSON('config'), r = await db.get('room');
  if (cfg && r?.key) {
    S.config = cfg; Object.assign(room, r);
    const list = (await vault.getJSON('messages')) || [], t = nowS();
    S.messages = list.filter(m => !(m.expiresAt && m.expiresAt <= t)).map(m => {
      if (m.status === 'sending') m.status = 'failed';
      if (m.mediaState === 'uploading' || m.mediaState === 'downloading') m.mediaState = 'failed';
      return m;
    });
    showChat(); startRelay();
  } else {
    $('#setup').hidden = false; setupValid();
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();



}
