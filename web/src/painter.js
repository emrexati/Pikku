// Tema duvar kağıtları: tuval üzerine yumuşak ışık, gölge ve ince detayla çizilir.
// Orta alan sade bırakılır ki mesajlar rahat okunsun.

const rgba = (h, a = 1) => `rgba(${h >> 16 & 255},${h >> 8 & 255},${h & 255},${a})`;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

function vgrad(c, w, h, stops) {
  const g = c.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function glow(c, x, y, r, color, alpha) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

// Gerçekçi yıldız alanı: çoğu çok küçük, birkaçı parlak ve hafif renkli
function stars(c, w, h, { count, top = 0, bottom = 1, seed, warm = false, band = null, alpha = 1 }) {
  const r = rng(seed), tints = warm ? [0xFFF6E0, 0xFFE8C2, 0xFFFFFF] : [0xFFFFFF, 0xDDE8FF, 0xFFF1DC, 0xCFE0FF];
  for (let i = 0; i < count; i++) {
    let x = r() * w, y = lerp(top, bottom, r()) * h;
    if (band) { const t = r(), off = (r() - .5) * band.width * (r() < .7 ? .35 : 1); x = lerp(band.x0, band.x1, t) * w + off * band.nx; y = lerp(band.y0, band.y1, t) * h + off * band.ny; }
    const big = r() < .04, s = big ? lerp(1.1, 1.8, r()) : lerp(.35, 1.05, r());
    const col = tints[(r() * tints.length) | 0], a = (big ? lerp(.75, 1, r()) : lerp(.25, .85, r())) * alpha;
    if (big) { c.save(); c.shadowColor = rgba(col, .9); c.shadowBlur = 6; }
    c.fillStyle = rgba(col, a); c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
    if (big) {
      c.restore();
      if (r() < .45) { c.strokeStyle = rgba(col, a * .55); c.lineWidth = .6; c.beginPath(); c.moveTo(x - s * 5, y); c.lineTo(x + s * 5, y); c.moveTo(x, y - s * 5); c.lineTo(x, y + s * 5); c.stroke(); }
    }
  }
}

// Gölgeli küre (gezegen, ay)
function sphere(c, x, y, R, light, mid, dark, lightDir = [-.45, -.5]) {
  const g = c.createRadialGradient(x + R * lightDir[0], y + R * lightDir[1], R * .1, x, y, R * 1.05);
  g.addColorStop(0, rgba(light)); g.addColorStop(.55, rgba(mid)); g.addColorStop(1, rgba(dark));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
}
function ring(c, x, y, rx, ry, tilt, color, width, half) {
  c.save(); c.translate(x, y); c.rotate(tilt);
  if (half) { c.beginPath(); c.rect(-rx * 1.5, half === 'front' ? 0 : -ry * 3, rx * 3, ry * 3); c.clip(); }
  const g = c.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(.2, rgba(color, .85)); g.addColorStop(.5, rgba(color, .55)); g.addColorStop(.8, rgba(color, .85)); g.addColorStop(1, rgba(color, 0));
  c.strokeStyle = g; c.lineWidth = width; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- Masal Gezegeni: alacakaranlıkta sakin bir masal manzarası
export function storybook(c, w, h) {
  vgrad(c, w, h, [[0, '#161A44'], [.38, '#3A3270'], [.66, '#9A6A9A'], [.86, '#E7A58C'], [1, '#F6CDA0']]);
  stars(c, w, h, { count: Math.round(w * h / 2600), top: 0, bottom: .55, seed: 11, warm: true });
  // Ay ve hâlesi
  const mx = w * .78, my = h * .14, mr = Math.min(w, h) * .075;
  glow(c, mx, my, mr * 5, 0xFFE2B0, .22);
  c.save(); c.shadowColor = 'rgba(255,226,176,.9)'; c.shadowBlur = mr * .9;
  sphere(c, mx, my, mr, 0xFFF8E6, 0xFDE7BC, 0xE9C58E, [-.3, -.35]); c.restore();
  c.fillStyle = 'rgba(214,170,110,.18)';
  for (const [dx, dy, s] of [[-.3, -.15, .2], [.25, .2, .14], [.05, -.4, .1], [-.1, .35, .09]]) { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, s * mr, 0, 7); c.fill(); }
  // Uzakta halkalı küçük gezegen
  const px = w * .2, py = h * .25, pr = Math.min(w, h) * .032;
  ring(c, px, py, pr * 2.1, pr * .55, -.32, 0xFFE9F2, pr * .16, 'back');
  sphere(c, px, py, pr, 0xFFD3E6, 0xD48BC2, 0x6A4A9A);
  ring(c, px, py, pr * 2.1, pr * .55, -.32, 0xFFE9F2, pr * .16, 'front');
  // Katmanlı tepeler (uzaktakiler daha açık)
  const hills = [
    { y: .76, amp: .035, col: ['#B9839E', '#A87493'], seed: 3 },
    { y: .82, amp: .03, col: ['#7E5C8F', '#6C4E80'], seed: 5 },
    { y: .89, amp: .025, col: ['#4A3768', '#3E2E5A'], seed: 9 }
  ];
  for (const hl of hills) {
    const r = rng(hl.seed), base = hl.y * h, a = hl.amp * h;
    const pts = Array.from({ length: 5 }, (_, i) => [i / 4 * w, base - a * (.3 + r() * .9)]);
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; c.bezierCurveTo(x0 + (x1 - x0) / 2, y0, x0 + (x1 - x0) / 2, y1, x1, y1); }
    c.lineTo(w, h); c.closePath();
    const g = c.createLinearGradient(0, base - a, 0, h); g.addColorStop(0, hl.col[0]); g.addColorStop(1, hl.col[1]);
    c.fillStyle = g; c.fill();
  }
  // Ateş böcekleri
  const r = rng(31);
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = lerp(.8, .97, r()) * h;
    c.save(); c.shadowColor = 'rgba(255,214,140,1)'; c.shadowBlur = 8; c.fillStyle = `rgba(255,226,160,${lerp(.5, .95, r())})`;
    c.beginPath(); c.arc(x, y, lerp(.8, 1.6, r()), 0, 7); c.fill(); c.restore();
  }
}

// ---------------------------------------------------------------- Olay Ufku: ışığı büken bir kara delik
export function eventHorizon(c, w, h) {
  const bg = c.createRadialGradient(w * .5, h * .21, 0, w * .5, h * .21, Math.max(w, h) * .9);
  bg.addColorStop(0, '#1A120C'); bg.addColorStop(.5, '#06060A'); bg.addColorStop(1, '#000000');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  stars(c, w, h, { count: Math.round(w * h / 1500), seed: 7, alpha: .9 });

  const x = w * .5, y = h * .21, R = Math.min(w, h) * .11, tilt = -.1;
  glow(c, x, y, R * 6, 0xFF8A2A, .12);
  // Diskin arka yarısı
  const diskPass = half => {
    for (let k = 0; k < 44; k++) {
      const t = k / 43, rx = R * (1.5 + t * 1.7), ry = rx * .16, a = Math.pow(1 - t, 1.5) * .55;
      c.save(); c.translate(x, y); c.rotate(tilt);
      c.beginPath(); c.rect(-rx * 1.2, half === 'front' ? 0 : -ry * 2, rx * 2.4, ry * 2); c.clip();
      const g = c.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, `rgba(255,248,230,${a})`); g.addColorStop(.35, `rgba(255,180,90,${a * .9})`);
      g.addColorStop(.7, `rgba(230,100,30,${a * .55})`); g.addColorStop(1, `rgba(120,40,10,${a * .25})`);
      c.strokeStyle = g; c.lineWidth = R * .07; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.stroke(); c.restore();
    }
  };
  diskPass('back');
  // Bükülmüş ışık hâlesi (diskin gölgenin üstünden görünen kısmı)
  for (let k = 0; k < 28; k++) {
    const t = k / 27, rr = R * (1.06 + t * .6), a = Math.pow(1 - t, 2.2) * .6;
    const g = c.createLinearGradient(x - rr, y, x + rr, y);
    g.addColorStop(0, `rgba(255,245,225,${a})`); g.addColorStop(.5, `rgba(255,170,80,${a * .8})`); g.addColorStop(1, `rgba(200,80,20,${a * .45})`);
    c.strokeStyle = g; c.lineWidth = R * .05; c.beginPath(); c.arc(x, y, rr, 0, 7); c.stroke();
  }
  // Foton halkası ve karanlık merkez
  c.save(); c.shadowColor = 'rgba(255,220,170,1)'; c.shadowBlur = R * .25;
  c.strokeStyle = 'rgba(255,246,228,.95)'; c.lineWidth = Math.max(1, R * .03); c.beginPath(); c.arc(x, y, R * 1.02, 0, 7); c.stroke(); c.restore();
  const sh = c.createRadialGradient(x, y, R * .85, x, y, R * 1.01); sh.addColorStop(0, '#000'); sh.addColorStop(1, 'rgba(0,0,0,.92)');
  c.fillStyle = sh; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  diskPass('front');
}

// ---------------------------------------------------------------- Laboratuvar: ince molekül örgüsü
export function science(c, w, h, dark) {
  vgrad(c, w, h, dark ? [[0, '#0B1E22'], [1, '#0F2B30']] : [[0, '#F4FBF9'], [1, '#E2F3EE']]);
  const line = dark ? 'rgba(94,214,190,.09)' : 'rgba(18,140,120,.08)';
  // Altıgen (grafen) örgü
  const s = 26, hw = Math.sqrt(3) * s;
  c.strokeStyle = line; c.lineWidth = 1;
  for (let row = -1; row < h / (s * 1.5) + 1; row++) {
    for (let col = -1; col < w / hw + 1; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * s * 1.5;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](cx + s * Math.cos(a), cy + s * Math.sin(a)); }
      c.closePath(); c.stroke();
    }
  }
  // Çubuk-top molekülleri
  const atom = (x, y, r, col) => {
    const g = c.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
    g.addColorStop(0, rgba(col[0], dark ? .55 : .7)); g.addColorStop(1, rgba(col[1], dark ? .55 : .7));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  };
  const bond = (a, b) => { c.strokeStyle = dark ? 'rgba(160,220,210,.28)' : 'rgba(40,90,85,.22)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
  const TEAL = [0x7FE3D0, 0x12A594], CORAL = [0xFFB4A2, 0xE8604C], SLATE = [0xC9D3DB, 0x71808E];
  const molecule = (ox, oy, sc, rot) => {
    const pts = [[0, 0], [1, .55], [2, 0], [2, -1.1], [1, -1.65], [0, -1.1]].map(([px, py]) => {
      const X = px * sc, Y = py * sc; return [ox + X * Math.cos(rot) - Y * Math.sin(rot), oy + X * Math.sin(rot) + Y * Math.cos(rot)];
    });
    for (let i = 0; i < 6; i++) bond(pts[i], pts[(i + 1) % 6]);
    const side = [pts[1][0] + (pts[1][0] - pts[4][0]) * .45, pts[1][1] + (pts[1][1] - pts[4][1]) * .45];
    const side2 = [pts[4][0] + (pts[4][0] - pts[1][0]) * .45, pts[4][1] + (pts[4][1] - pts[1][1]) * .45];
    bond(pts[1], side); bond(pts[4], side2);
    pts.forEach((p, i) => atom(p[0], p[1], sc * .2, i % 3 === 0 ? SLATE : TEAL));
    atom(side[0], side[1], sc * .24, CORAL); atom(side2[0], side2[1], sc * .17, TEAL);
  };
  const m = Math.min(w, h);
  molecule(w * .78, h * .12, m * .07, .4);
  molecule(w * .1, h * .9, m * .06, -.3);
  molecule(w * .86, h * .74, m * .045, 1.2);
  // Köşede soluk atom yörüngeleri
  c.save(); c.translate(w * .14, h * .14); c.strokeStyle = dark ? 'rgba(94,214,190,.22)' : 'rgba(18,140,120,.2)'; c.lineWidth = 1.4;
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(0, 0, m * .085, m * .03, 0, 0, 7); c.stroke(); c.restore(); }
  atom(0, 0, m * .012, CORAL); c.restore();
}

// ---------------------------------------------------------------- Uzay: Samanyolu, bulutsular ve gaz devi
export function space(c, w, h) {
  vgrad(c, w, h, [[0, '#04051A'], [.55, '#0A0A26'], [1, '#160B30']]);
  const band = { x0: -.1, y0: .95, x1: 1.1, y1: .2, width: Math.min(w, h) * .55, nx: .53, ny: .85 };
  c.save(); c.globalCompositeOperation = 'lighter';
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const t = r(), x = lerp(band.x0, band.x1, t) * w + (r() - .5) * 80, y = lerp(band.y0, band.y1, t) * h + (r() - .5) * 80;
    const col = [0x6E4BFF, 0xC2459A, 0x2E7BFF, 0x8A5CFF][(r() * 4) | 0];
    glow(c, x, y, lerp(60, 170, r()), col, lerp(.05, .13, r()));
  }
  c.restore();
  stars(c, w, h, { count: Math.round(w * h / 2200), seed: 99 });
  stars(c, w, h, { count: Math.round(w * h / 900), seed: 98, band, alpha: .7 });
  // Gaz devi (sağ üst köşeden taşan)
  const R = Math.min(w, h) * .26, px = w * .98, py = h * .1;
  ring(c, px, py, R * 1.9, R * .38, .38, 0xF6D7B0, R * .07, 'back');
  c.save(); c.beginPath(); c.arc(px, py, R, 0, 7); c.clip();
  sphere(c, px, py, R, 0xFFD9A8, 0xE08E62, 0x5A2A3A, [-.6, .45]);
  const rs = rng(5);
  for (let i = 0; i < 9; i++) {
    const yy = py - R + (i + rs()) * (2 * R / 9);
    c.fillStyle = `rgba(${i % 2 ? '120,50,60' : '255,230,200'},${lerp(.06, .14, rs())})`;
    c.save(); c.translate(px, yy); c.rotate(.38); c.fillRect(-R * 1.5, -R * .04, R * 3, R * lerp(.05, .11, rs())); c.restore();
  }
  const term = c.createRadialGradient(px + R * .7, py - R * .6, R * .2, px + R * .4, py - R * .3, R * 1.6);
  term.addColorStop(0, 'rgba(0,0,10,.75)'); term.addColorStop(.6, 'rgba(0,0,10,.15)'); term.addColorStop(1, 'rgba(0,0,10,0)');
  c.fillStyle = term; c.fillRect(px - R, py - R, R * 2, R * 2); c.restore();
  ring(c, px, py, R * 1.9, R * .38, .38, 0xF6D7B0, R * .07, 'front');
  // Küçük ay
  const mx = w * .14, my = h * .82, mr = Math.min(w, h) * .035;
  sphere(c, mx, my, mr, 0xEDEBF5, 0xA8A4C2, 0x2E2A48, [-.5, -.4]);
  c.fillStyle = 'rgba(60,56,90,.25)';
  for (const [dx, dy, s] of [[-.25, -.2, .22], [.3, .15, .15], [-.05, .4, .12]]) { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, s * mr, 0, 7); c.fill(); }
}
