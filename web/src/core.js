import { storybook, eventHorizon, science, space } from './painter.js';
// Pikku çekirdeği: şifreleme, aktarma, mesajlar, aramalar ve tema durumu.
// Arayüzden bağımsızdır; iPhone'daki Pikku ile aynı protokolü kullanır.

// ---------------------------------------------------------------- değişiklik bildirimi
let version = 0, queued = false;
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getVersion = () => version;
export function emit() {
  version++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach(f => f()); });
}
export const hooks = { toast: null };
function toast(text, ms) { hooks.toast?.(text, ms); }

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
    if (r.status === 429) throw new Error('limit');
    if (!r.ok) throw new Error('server');
  }
  async upload(u8, topic) {
    const r = await fetch(this.server + '/' + topic + '?filename=m.bin', { method: 'PUT', body: u8 });
    if (r.status === 413) throw new Error('tooLarge');
    if (r.status === 429) throw new Error('limit');
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
  { name: 'Masal Gezegeni', light: [0x161A44, 0xF6CDA0], dark: [0x161A44, 0xF6CDA0], style: 'storybook',
    preset: { mode: 2, accent: 0xF2B35B, myBubble: 0xF4BE73, myText: 0x2B1A08, theirBubble: 0x2C2652, theirText: 0xF5EEFF } },
  { name: 'Olay Ufku', light: [0x06060A, 0x000000], dark: [0x06060A, 0x000000], style: 'eventHorizon',
    preset: { mode: 2, accent: 0xFF9F43, myBubble: 0xF08A2C, myText: 0x1A0D02, theirBubble: 0x1C1D22, theirText: 0xECEDEF } },
  { name: 'Laboratuvar', light: [0xF4FBF9, 0xE2F3EE], dark: [0x0B1E22, 0x0F2B30], style: 'science',
    preset: { mode: 1, accent: 0x12A594, myBubble: 0x12A594, myText: 0xFFFFFF, theirBubble: 0xFFFFFF, theirText: 0x0E2A26 } },
  { name: 'Uzay', light: [0x04051A, 0x160B30], dark: [0x04051A, 0x160B30], style: 'space',
    preset: { mode: 2, accent: 0xA78BFA, myBubble: 0x7C5CFF, myText: 0xFFFFFF, theirBubble: 0x1C1E3C, theirText: 0xE8E8FF } },
  { name: 'Sade', light: [0xFFFFFF, 0xFFFFFF], dark: [0x000000, 0x000000] }
];
export const PLAIN_WALLS = [9, 0, 1, 2, 3, 4];
const ACCENTS = [0x007AFF, 0x34C759, 0x5856D6, 0xFF9500, 0xFF2D55, 0xFF3B30, 0x30B0C7, 0x8E8E93];
const css = (h, a = 1) => `rgba(${h >> 16 & 255},${h >> 8 & 255},${h & 255},${a})`;
const toHex = h => '#' + h.toString(16).padStart(6, '0');
const fromHex = s => parseInt(s.slice(1), 16);

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rr = (r, a, b) => a + r() * (b - a);

const Paint = { storybook, eventHorizon, science, space };

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


// ---------------------------------------------------------------- tema durumu
export const defaultTheme = () => ({ mode: 0, accent: 0x007AFF, myBubble: null, myText: null, theirBubble: null, theirText: null, fontSize: 17, wallpaper: 9 });
export let theme = (() => { try { return { ...defaultTheme(), ...JSON.parse(LS.get('theme') || '{}') }; } catch { return defaultTheme(); } })();
export const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// Çizimli temalar kendi açık/koyu görünümünü zorunlu kılar; yoksa yazılar arka planda kaybolur
export const isDark = () => {
  const p = WALLS[theme.wallpaper]?.preset;
  if (p) return p.mode === 2;
  return theme.mode === 2 || (theme.mode === 0 && darkQuery.matches);
};
const THEME_KEYS = ['mode', 'accent', 'myBubble', 'myText', 'theirBubble', 'theirText', 'wallpaper'];
export const isClassic = () => { const d = defaultTheme(); return THEME_KEYS.every(k => theme[k] === d[k]); };
export const presetActive = i => { const p = WALLS[i]?.preset; return !!p && theme.wallpaper === i && THEME_KEYS.slice(0, 6).every(k => theme[k] === p[k]); };

export function applyTheme() {
  const root = document.documentElement, dark = isDark(), s = root.style;
  root.toggleAttribute('data-dark', dark);
  s.colorScheme = dark ? 'dark' : 'light';
  const acc = toHex(theme.accent);
  for (const k of ['--pk-accent', '--color-accent', '--color-text-accent', '--color-icon-accent']) s.setProperty(k, acc);
  s.setProperty('--color-accent-muted', css(theme.accent, .2));
  s.setProperty('--pk-fs', theme.fontSize + 'px');
  const setOpt = (name, v, meta) => {
    if (v == null) { s.removeProperty(name); if (meta) s.removeProperty(meta); }
    else { s.setProperty(name, toHex(v)); if (meta) s.setProperty(meta, css(v, .62)); }
  };
  setOpt('--pk-my-bubble', theme.myBubble); setOpt('--pk-my-text', theme.myText, '--pk-my-meta');
  setOpt('--pk-their-bubble', theme.theirBubble); setOpt('--pk-their-text', theme.theirText, '--pk-their-meta');
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = dark ? '#000000' : '#FFFFFF';
  emit();
}
function storeTheme() { LS.set('theme', JSON.stringify(theme)); applyTheme(); }
export function setTheme(patch) { theme = { ...theme, ...patch }; storeTheme(); }
export function applyPreset(i) {
  const p = WALLS[i]?.preset; if (!p) return;
  setTheme({ wallpaper: i, mode: p.mode, accent: p.accent, myBubble: p.myBubble, myText: p.myText, theirBubble: p.theirBubble, theirText: p.theirText });
}
export function resetTheme() { const d = defaultTheme(); setTheme(Object.fromEntries(THEME_KEYS.map(k => [k, d[k]]))); }
export function selectWall(i) {
  const patch = { wallpaper: i };
  if (WALLS[theme.wallpaper]?.preset) { const d = defaultTheme(); for (const k of THEME_KEYS.slice(0, 6)) patch[k] = d[k]; }
  setTheme(patch);
}
let themeBackup = null;
export const snapshotTheme = () => { themeBackup = { ...theme }; };
export const restoreTheme = () => { if (themeBackup) { theme = { ...themeBackup }; storeTheme(); } };
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
    return await viaRelays(r => r.publish(sealed, cache, keepalive));
  } catch { return false; }
}
// Önce ana sunucu, olmazsa (kota dolu ya da erişilemiyor) yedek sunucu denenir.
// İki taraf da ikisini birden dinlediği için mesaj hangisinden giderse gitsin ulaşır.
async function viaRelays(fn) {
  const limited = S.primaryLimited && Date.now() - S.primaryLimited < 600000;
  const list = (limited ? [S.backup, S.relay] : [S.relay, S.backup]).filter(Boolean);
  let err;
  for (const r of list) {
    try { const v = await fn(r); if (r === S.relay) S.primaryLimited = 0; return v ?? true; }
    catch (e) { err = e; if (e.message === 'tooLarge') throw e; if (r === S.relay && e.message === 'limit') noteLimit(); }
  }
  throw err || new Error('server');
}
function noteLimit() {
  const first = !S.primaryLimited;
  S.primaryLimited = Date.now();
  if (first && !S.backup) hooks.toast?.('Sunucunun günlük mesaj sınırı doldu. Ayarlar › Bağlantı bölümünden başka bir sunucu seçebilirsin.', 7000);
}
const fire = (env, cache = true) => { post(env, cache); };

function newOutgoing() {
  const t = nowS();
  const m = { id: uuid(), text: '', mine: true, date: t, status: 'sending', ts: t };
  if (S.ttl > 0) m.expiresAt = t + S.ttl;
  return m;
}
const byId = id => S.messages.find(m => m.id === id);
function setStatus(id, s) { const m = byId(id); if (!m || (m.status === 'read' && s === 'sent')) return; m.status = s; save(); emit(); }
function setMedia(id, s) { const m = byId(id); if (!m) return; m.mediaState = s; save(); emit(); }

function sendText(text, replyTo) {
  const t = text.trim().slice(0, MAX_LEN);
  if (!t) return;
  const m = newOutgoing(); m.text = t; if (replyTo) m.replyTo = replyTo;
  S.messages.push(m); save(); emit(); deliver(m);
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
  m.text = t; m.edited = true; save(); emit();
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
    S.messages.push(m); save(); emit(); upload(m.id);
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
  S.messages.push(m); save(); emit(); upload(m.id);
}
async function upload(id) {
  const m = byId(id); if (!m || !room.key || !S.relay) return;
  setMedia(id, 'uploading'); setStatus(id, 'sending');
  try {
    const raw = await vault.getBytes('media:' + id); if (!raw) throw new Error('missing');
    const sealedRaw = await room.sealData(raw);
    const url = await viaRelays(r => r.upload(sealedRaw, room.mediaTopic));
    const mm = byId(id); if (!mm) return;
    mm.media.url = url; mm.mediaState = 'ready'; save(); emit(); deliver(mm);
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
    mm.localFile = id; mm.mediaState = 'ready'; save(); emit();
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
  save(); emit();
}
const deleteForMe = m => removeMessage(m.id);
function deleteForAll(m) { removeMessage(m.id); const env = makeEnv('delete'); env.target = m.id; fire(env); }
async function clearLocal() {
  S.messages = []; save();
  await db.delPrefix('media:'); await db.delPrefix('poster:');
  for (const u of S.mediaURLs.values()) URL.revokeObjectURL(u); S.mediaURLs.clear();
  emit();
}
function clearForAll() { clearLocal(); fire(makeEnv('clear')); }
function setTTL(v) {
  if (v === S.ttl) return;
  S.ttl = v; LS.set('ttl', v); fire(makeEnv('ttl', String(v)));
  appendSystem(v > 0 ? `Otomatik silme: ${ttlLabel(v)}` : 'Otomatik silme kapatıldı');
  emit();
}
function appendSystem(text) {
  const t = nowS(); const m = { id: uuid(), text, mine: false, date: t, status: 'received', system: true, ts: t };
  if (S.ttl > 0) m.expiresAt = t + S.ttl;
  S.messages.push(m); save(); emit();
}

// ---------------------------------------------------------------- çevrimiçi, yazıyor, okundu
function userTyping() {
  if (!S.config?.showPresence || Date.now() - S.lastTypingSent < 8000) return;
  S.lastTypingSent = Date.now(); fire(makeEnv('typing'), false);
}
function sendPresence(on, force) {
  if (!S.config || (!S.config.showPresence && on)) return;
  // Mesaj kotasını korumak için: düzenli sinyal 4 dakikada bir, zorunlu olanlar da en sık 45 saniyede bir
  if (on && Date.now() - S.lastPresenceSent < (force ? 45000 : 240000)) return;
  if (!on && !S.lastPresenceSent) return;
  S.lastPresenceSent = on ? Date.now() : 0;
  post(makeEnv('presence', on ? 'on' : 'off'), false, !on);
}
function markPeerSeen() { S.peerOnline = true; S.lastPeerPing = Date.now(); S.peerLastSeen = nowS(); LS.set('peerLastSeen', S.peerLastSeen); emit(); }
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
  if (S.peerOnline && Date.now() - S.lastPeerPing > 300000) { S.peerOnline = false; S.peerTyping = false; }
  const t = nowS(), expired = S.messages.filter(m => m.expiresAt && m.expiresAt <= t);
  for (const m of expired) removeMessage(m.id);
  emit();
}, 5000);

// ---------------------------------------------------------------- alma
const BACKUP_SERVER = 'https://ntfy.envs.net';
function startRelay() {
  S.relay?.stop(); S.backup?.stop(); S.relay = null; S.backup = null; S.connected = false;
  if (!S.config || !room.key) return;
  const up = { main: false, backup: false };
  const onState = which => ok => { const was = S.connected; up[which] = ok; S.connected = up.main || up.backup; if (S.connected && !was) sendPresence(true, true); if (S.connected !== was) emit(); };
  const primary = (S.config.server || 'https://ntfy.sh').replace(/\/+$/, '');
  const r = new Relay(primary, room.topic, LS.get('since-' + room.topic) || '12h');
  r.onState = onState('main');
  r.onMessage = (id, body) => { LS.set('since-' + room.topic, id); receive(body); };
  S.relay = r; r.start();
  if (primary !== BACKUP_SERVER) {
    const b = new Relay(BACKUP_SERVER, room.topic, LS.get('since2-' + room.topic) || '12h');
    b.onState = onState('backup');
    b.onMessage = (id, body) => { LS.set('since2-' + room.topic, id); receive(body); };
    S.backup = b; b.start();
  }
  emit();
}
let notifyCount = 0;
function notify(title, body) {
  if (!S.config?.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, icon: 'icon-192.png', tag: 'pikku' }); n.onclick = () => { focus(); n.close(); }; } catch {}
  notifyCount++; document.title = `(${notifyCount}) Pikku`;
}

async function receive(body) {
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
      save(); emit();
      if (m.media) download(m.id);
      if (age < 120) markPeerSeen();
      notify(displayPeer(), m.media ? (m.media.kind === 'video' ? 'Video' : 'Fotoğraf') : 'Yeni mesaj');
      scheduleRead();
      break;
    }
    case 'edit': { const m = byId(env.target); if (m && !m.mine) { m.text = String(env.body).slice(0, MAX_LEN); m.edited = true; save(); emit(); } break; }
    case 'delete': if (env.target) removeMessage(env.target); break;
    case 'clear': await clearLocal(); appendSystem(`${displayPeer()} sohbeti temizledi`); break;
    case 'ttl': { const v = Number(env.body) || 0; S.ttl = v; LS.set('ttl', v); appendSystem(v > 0 ? `${displayPeer()} otomatik silmeyi ${ttlLabel(v)} yaptı` : `${displayPeer()} otomatik silmeyi kapattı`); break; }
    case 'read': {
      const upTo = Number(env.body) || 0; let ch = false;
      for (const m of S.messages) if (m.mine && m.status === 'sent' && (m.ts ?? Infinity) <= upTo) { m.status = 'read'; ch = true; }
      if (ch) { save(); emit(); }
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
      receive.typing = setTimeout(() => { S.peerTyping = false; emit(); }, 6000);
      break;
    case 'screenshot': appendSystem(`${displayPeer()} ekran görüntüsü aldı`); break;
    case 'offer': case 'answer': case 'hangup': case 'reject': case 'busy': Call.handle(env); break;
  }
  emit();
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
    emit();
    pc.ontrack = ev => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      this.remote = stream; emit();
    };
    pc.oniceconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        this.reconnecting = false;
        if (this.state !== 'active') { this.state = 'active'; this.startedAt = nowS(); }
        emit();
      } else if (s === 'disconnected') { if (this.state === 'active') { this.reconnecting = true; emit(); } }
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
  toggleMute() { this.muted = !this.muted; this.local?.getAudioTracks().forEach(t => t.enabled = !this.muted); emit(); },
  toggleCam() { this.camOff = !this.camOff; this.local?.getVideoTracks().forEach(t => t.enabled = !this.camOff); emit(); },
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
      this.localVersion = (this.localVersion || 0) + 1;
    } catch { this.facing = this.facing === 'user' ? 'environment' : 'user'; toast('Kamera değiştirilemedi'); }
    emit();
  },
  reset() { this.muted = false; this.camOff = false; this.facing = 'user'; this.reconnecting = false; this.startedAt = 0; },
  set(s) { this.state = s; emit(); },
  cleanup() {
    this.stopRing(); clearTimeout(this.timeout);
    this.local?.getTracks().forEach(t => t.stop()); this.local = null;
    try { this.pc?.close(); } catch {} this.pc = null;
    this.remote = null;
    this.pendingOffer = null; this.startedAt = 0; this.reconnecting = false; this.state = 'idle'; emit();
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
  render() { emit(); },
  status() {
    switch (this.state) {
      case 'incoming': return this.video ? 'Görüntülü arama geliyor…' : 'Sesli arama geliyor…';
      case 'outgoing': return 'Çalıyor…';
      case 'connecting': return 'Bağlanıyor…';
      case 'active': return this.reconnecting ? 'Yeniden bağlanıyor…' : durText(nowS() - this.startedAt);
    }
    return '';
  }
};
addEventListener('beforeunload', () => { if (Call.state !== 'idle') { const e = makeEnv('hangup'); e.callId = Call.id; e.video = Call.video; post(e, true, true); } sendPresence(false, true); });


// ---------------------------------------------------------------- kurulum, ayarlar, yaşam döngüsü
export function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(16));
  return [0, 1, 2, 3].map(g => [0, 1, 2, 3].map(i => chars[r[g * 4 + i] % chars.length]).join('')).join('-');
}
export const codeIsValid = code => normalize(code || '').length >= 12;

export async function setup(name, code) {
  code = code.trim().toUpperCase();
  const r = await deriveRoom(code);
  await db.set('room', r);
  Object.assign(room, r);
  S.config = { myName: name.trim(), code, server: 'https://ntfy.sh', deviceId: uuid(), turnURL: '', turnUser: '', turnPass: '', showPresence: true, readReceipts: true, notify: false };
  await saveConfig();
  startRelay(); emit();
}

export async function saveSettings(patch) {
  const n = { ...S.config, ...patch };
  n.myName = (n.myName || '').trim() || S.config.myName;
  n.server = (n.server || '').trim() || 'https://ntfy.sh';
  try { new URL(n.server); } catch { n.server = 'https://ntfy.sh'; }
  n.turnURL = (n.turnURL || '').trim(); n.turnUser = (n.turnUser || '').trim();
  const serverChanged = n.server !== S.config.server, presenceOff = S.config.showPresence && !n.showPresence;
  if (presenceOff) sendPresence(false, true);
  S.config = n; await saveConfig();
  if (serverChanged) startRelay();
  if (n.showPresence) sendPresence(true, true);
  emit();
}

export async function requestNotifications() {
  if (!('Notification' in window)) { toast('Bu tarayıcı bildirimleri desteklemiyor'); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') toast('Bildirim izni verilmedi');
  return p === 'granted';
}

export async function resetPairing() {
  sendPresence(false, true); S.relay?.stop(); S.relay = null; S.backup?.stop(); S.backup = null;
  await clearLocal(); await db.del('config'); await db.del('room');
  for (const k of ['peerName', 'peerLastSeen', 'ttl', 'lastReadSentTs']) LS.del(k);
  location.reload();
}

export const supported = () => !!(window.crypto?.subtle && window.CompressionStream && window.indexedDB);

export async function init() {
  applyTheme();
  if (!supported()) return;
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
    startRelay();
  }
  S.ready = true; emit();
}

let offTimer = null;
document.addEventListener('visibilitychange', () => {
  S.active = !document.hidden;
  if (!S.config) return;
  clearTimeout(offTimer);
  if (S.active) { notifyCount = 0; document.title = 'Pikku'; S.relay?.reconnect(); S.backup?.reconnect(); sendPresence(true, true); scheduleRead(); }
  else { S.peerTyping = false; offTimer = setTimeout(() => { if (document.hidden) sendPresence(false, true); }, 20000); }
  emit();
});

export {
  S, Call, WALLS, ACCENTS, TTL_OPTIONS, MAX_LEN, css, toHex, fromHex, paintWall, normalize, uuid, nowS, durText,
  timeFmt, dayFmt, sameDay, isToday, isYesterday, ttlLabel, displayPeer, peerStatus, byId, mediaURL,
  sendText, editText, retry, sendImage, sendVideo, deleteForMe, deleteForAll, clearLocal, clearForAll, setTTL,
  userTyping, scheduleRead, room, deriveRoom
};
