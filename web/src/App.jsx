import { useEffect, useMemo, useRef, useState } from 'react';
import { useCore } from './store.js';
import { Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import trTR from '@astryxdesign/core/locales/tr-TR.json';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Avatar, AvatarStatusDot } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ContextMenu } from '@astryxdesign/core/ContextMenu';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import { useToast } from '@astryxdesign/core/Toast';
import {
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble,
  ChatSystemMessage, ChatComposerInput, ChatSendButton
} from '@astryxdesign/core/Chat';
import * as core from './core.js';
import { S, Call } from './core.js';
import { Settings } from './Settings.jsx';
import { CallScreen } from './CallScreen.jsx';
import { Wallpaper } from './Wallpaper.jsx';
import {
  GearIcon, VideoIcon, PhoneIcon, PlusIcon, ReplyIcon, PencilIcon, CopyIcon, TrashIcon,
  RetryIcon, TimerIcon, PlayIcon, LockIcon, DownIcon, UpIcon, ClockIcon, AlertIcon
} from './icons.jsx';


// ---------------------------------------------------------------- kök
export default function App() {
  useCore();
  const [ready, setReady] = useState(false);
  useEffect(() => { core.init().then(() => setReady(true)); }, []);
  const mode = core.isDark() ? 'dark' : 'light';
  return (
    <InternationalizationProvider locale="tr-TR" messages={{ 'tr-TR': trTR }}>
      <Theme theme={neutralTheme} mode={mode}>
        <ToastBridge />
        <Wallpaper />
        {!ready ? null : !core.supported() ? <Unsupported /> : S.config ? <Chat /> : <Setup />}
        <CallScreen />
      </Theme>
    </InternationalizationProvider>
  );
}

function ToastBridge() {
  const show = useToast();
  useEffect(() => { core.hooks.toast = (body, ms, opts = {}) => show({ body, autoHideDuration: ms || 3500, uniqueID: opts.uniqueID || String(body), ...opts }); return () => { core.hooks.toast = null; }; }, [show]);
  return null;
}

function Unsupported() {
  return (
    <div className="pk-center">
      <div className="pk-glass"><EmptyState title="Tarayıcın desteklenmiyor" description="Pikku için güncel Safari, Chrome, Edge veya Firefox gerekiyor." /></div>
    </div>
  );
}

// ---------------------------------------------------------------- kurulum
// Kodu yazarken 4'lü gruplara ayırır: K7QM-2XHP-R9TA-W4NE
const formatCode = v => (v.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 32).match(/.{1,4}/gu) || []).join('-');

function Setup() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const valid = core.codeIsValid(code);
  const missing = !name.trim() ? 'Devam etmek için adını yaz.' : !valid ? 'Devam etmek için en az 12 karakterlik kodu gir ya da yeni kod üret.' : '';
  const copy = () => navigator.clipboard?.writeText(code).then(() => core.hooks.toast?.('Kopyalandı')).catch(() => {});
  const start = async () => {
    setBusy(true);
    try { await core.setup(name, code); } catch { core.hooks.toast?.('Bu tarayıcı gerekli şifrelemeyi desteklemiyor'); setBusy(false); }
  };
  return (
    <main className="pk-center pk-scroll" aria-label="Pikku kurulumu">
      <div className="pk-setup pk-glass">
        <img className="pk-setup-logo" src="icon-192.png" alt="" />
        <Heading level={1} justify="center">Pikku</Heading>
        <Text type="supporting" as="p" justify="center" display="block">Yalnızca ikiniz için. Mesajlar, dosyalar ve aramalar uçtan uca şifreli.</Text>
        <div className="pk-form">
          <TextInput label="Adın" value={name} onChange={setName} placeholder="Örn. Emre" autoComplete="nickname" width="100%" size="lg" />
          <div onBlur={() => setCodeTouched(true)}>
          <TextInput
            label="Eşleşme kodu" value={code} onChange={v => setCode(formatCode(v))} placeholder="XXXX-XXXX-XXXX-XXXX" width="100%" size="lg"
            autoCapitalize="characters" hasAutoCorrect={false} hasSpellCheck={false} controlClassName="pk-mono"
            status={codeTouched && code && !valid ? { type: 'error', message: `Kod çok kısa: ${core.normalize(code).length}/12 karakter. Eksiksiz yaz ya da “Yeni kod üret”e dokun.` } : undefined}
            description="Biriniz kod üretip diğerine güvenli bir yoldan iletsin; ikiniz de aynı kodu girin."
          />
          </div>
          <div className="pk-row-between">
            <Button label="Yeni kod üret" variant="ghost" size="lg" onClick={() => { setCode(core.randomCode()); setCodeTouched(false); }} />
            <Button label="Kopyala" variant="ghost" size="lg" icon={<Icon icon={CopyIcon} />} isDisabled={!code} onClick={copy} />
          </div>
          <Button label={busy ? 'Anahtar oluşturuluyor' : 'Başla'} variant="primary" size="lg" width="100%" className="pk-cta" isLoading={busy} isDisabled={!valid || !name.trim()} onClick={start} aria-describedby="pk-setup-hint" />
          <p id="pk-setup-hint" className="pk-setup-hint" aria-live="polite">{busy ? '' : missing}</p>
          <Text type="supporting" size="sm" as="p" justify="center" display="block">iPhone'daki Pikku ile aynı kod kullanılır; ikisi birbiriyle konuşur.</Text>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- sohbet
function Chat() {
  useCore();
  const [draft, setDraft] = useState('');
  const [replying, setReplying] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef(null);
  // İlk yüklemedeki mesajlar canlanmasın; sonradan gelenler canlansın
  useEffect(() => { const t = setTimeout(() => document.documentElement.classList.add('pk-ready'), 700); return () => { clearTimeout(t); document.documentElement.classList.remove('pk-ready'); }; }, []);

  const waiting = !S.peerName; // karşı taraf henüz hiç bağlanmadı
  const name = S.peerName || 'Karşı taraf';
  const status = waiting && !S.messages.length && S.connected ? 'henüz katılmadı' : core.peerStatus();
  const online = S.connected && S.config?.showPresence && (S.peerOnline || S.peerTyping);

  const submit = value => {
    const v = (value ?? draft).trim();
    if (!v) return;
    if (editing) { core.editText(editing, v); setEditing(null); }
    else { core.sendText(v, replying?.id); setReplying(null); }
    setDraft('');
  };
  const onDraft = v => { setDraft(v); if (v) core.userTyping(); };
  const pickFiles = files => {
    for (const f of files) {
      if (f.type.startsWith('video/')) core.sendVideo(f);
      else if (f.type.startsWith('image/')) core.sendImage(f);
      else core.hooks.toast?.('Yalnızca fotoğraf ve video gönderilebilir');
    }
  };
  const startEdit = m => { setEditing(m); setReplying(null); setDraft(m.text); };
  const cancelContext = () => { if (editing) setDraft(''); setEditing(null); setReplying(null); };

  const openSettings = () => { core.snapshotTheme(); setSettingsOpen(true); };
  const context = editing || replying;
  const canSend = !!draft.trim();
  const composer = (
    <div className="pk-composer"><div className="pk-compose-card">
      {context && (
        <div className="pk-context">
          <span className="pk-context-bar" />
          <div className="pk-context-text">
            <Text type="label" color="accent" display="block">{editing ? 'Düzenleniyor' : context.mine ? 'Kendi mesajına yanıt' : `${core.displayPeer()} yanıtlanıyor`}</Text>
            <Text type="supporting" maxLines={1} display="block" hasTruncateTooltip={false}>{preview(context)}</Text>
          </div>
          <IconButton label="Vazgeç" variant="ghost" size="sm" icon={<Icon icon={PlusIcon} style={{ transform: 'rotate(45deg)' }} />} onClick={cancelContext} />
        </div>
      )}
      <div className="pk-compose-row">
        <button type="button" className="pk-attach" aria-label="Fotoğraf veya video ekle" disabled={!!editing} onClick={() => fileRef.current?.click()}>
          <Icon icon={PlusIcon} size="md" />
        </button>
        <div className="pk-field">
          <ChatComposerInput value={draft} onChange={onDraft} onSubmit={submit} placeholder="Mesaj" pasteAsToken={false} hasHistory={false} maxRows={5} label="Mesaj yaz" onFiles={pickFiles} />
        </div>
        <ChatSendButton onSend={() => submit()} isDisabled={!canSend} size="sm" className="pk-send" />
      </div>
    </div></div>
  );

  // Silme 5 sn bekletilir; bu sürede "Geri al" ile vazgeçilebilir
  const [hidden, setHidden] = useState(() => new Set());
  const removeHidden = id => setHidden(s => { const n = new Set(s); n.delete(id); return n; });
  const del = (m, forAll) => {
    setHidden(s => new Set(s).add(m.id));
    let dismiss = null;
    const commit = () => { pendingDeletes.delete(m.id); (forAll ? core.deleteForAll : core.deleteForMe)(m); removeHidden(m.id); };
    const timer = setTimeout(commit, 5000);
    pendingDeletes.set(m.id, () => { clearTimeout(timer); commit(); });
    const undo = () => { clearTimeout(timer); pendingDeletes.delete(m.id); removeHidden(m.id); dismiss?.(); };
    dismiss = core.hooks.toast?.(forAll ? 'Mesaj iki taraftan da silinecek' : 'Mesaj silindi', 5000, {
      uniqueID: 'del-' + m.id,
      endContent: <Button label="Geri al" variant="ghost" size="sm" onClick={undo} />
    });
  };
  const reply = m => { setReplying(m); setEditing(null); };

  // Tek seferlik ipucu: kaydırarak yanıtlama ve basılı tutma menüsü
  useEffect(() => {
    if (!S.messages.some(m => !m.system) || localStorage.getItem('pk-hint-swipe')) return;
    const t = setTimeout(() => { localStorage.setItem('pk-hint-swipe', '1'); core.hooks.toast?.('İpucu: Yanıtlamak için mesajı sola kaydır. Kopyalama, düzenleme ve silme için basılı tut.', 7000); }, 1500);
    return () => clearTimeout(t);
  }, [S.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3: Yapışkan gün etiketi yalnızca kaydırırken görünür; durunca mesajların üstünden çekilir
  useEffect(() => {
    const root = document.querySelector('.pk-chat'); if (!root) return;
    let timer = null;
    const mark = sc => {
      const lim = (document.querySelector('.pk-top')?.getBoundingClientRect().bottom || 0) + 16;
      for (const d of sc.querySelectorAll('.pk-day')) d.toggleAttribute('data-stuck', d.getBoundingClientRect().top <= lim);
    };
    const onScroll = e => {
      const sc = e.target; if (!(sc instanceof Element)) return;
      root.setAttribute('data-scrolling', ''); mark(sc);
      clearTimeout(timer); timer = setTimeout(() => { root.removeAttribute('data-scrolling'); mark(sc); }, 1000);
    };
    root.addEventListener('scroll', onScroll, true);
    const log = root.querySelector('[role="log"]'); if (log) mark(log);
    return () => { root.removeEventListener('scroll', onScroll, true); clearTimeout(timer); };
  });

  const rows = useMemo(() => buildRows(S.messages.filter(m => !hidden.has(m.id))), [core.getVersion(), hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = viewer && viewer.url ? { src: viewer.url, alt: viewer.video ? 'Video' : 'Fotoğraf', type: viewer.video ? 'video' : 'image' } : null;

  return (
    <div className="pk-app">
      <header className="pk-top">
        <button type="button" className="pk-peer" onClick={openSettings}>
          {waiting
            ? <span className="pk-avatar-wait" aria-hidden="true"><Icon icon={LockIcon} size="md" /></span>
            : <Avatar name={name} size={44} tooltip={false} status={online ? <AvatarStatusDot variant="success" label="Çevrimiçi" /> : undefined} />}
          <div className="pk-peer-text">
            <span className="pk-peer-name">{name}{S.ttl > 0 && <Icon icon={TimerIcon} size="sm" color="accent" label="Otomatik silme açık" />}</span>
            <span key={status} className={'pk-peer-status' + (online ? ' on' : '')}>{status}</span>
          </div>
          <span className="pk-sr"> · Ayarlar</span>
        </button>
        <div className="pk-top-actions">
          <IconButton label="Görüntülü ara" variant="ghost" icon={<Icon icon={VideoIcon} size="lg" />} onClick={() => Call.start(true)} />
          <IconButton label="Sesli ara" variant="ghost" icon={<Icon icon={PhoneIcon} size="lg" />} onClick={() => Call.start(false)} />
          <span className="pk-top-sep" aria-hidden="true" />
          <IconButton label="Ayarlar" variant="ghost" className="pk-gear" icon={<Icon icon={GearIcon} size="lg" />} onClick={openSettings} />
        </div>
      </header>

      <main className="pk-chat" aria-label="Sohbet">
        <h1 className="pk-sr">{name} ile sohbet</h1>
        <ChatLayout
          composer={composer}
          emptyState={<div className="pk-glass pk-empty"><EmptyState icon={<Icon icon={LockIcon} size="lg" />} title="Henüz mesaj yok" description="Karşı taraf aynı eşleşme koduyla giriş yaptığında mesajlarınız birbirine ulaşır." /></div>}
        >
          {rows.length ? (
            <ChatMessageList>
              {groupByDay(rows).map(g => (
                <div key={g.key} className="pk-day-group">
                  <div className="pk-day" role="separator"><span>{g.label}</span></div>
                  {g.items.map(r => r.type === 'sys'
                    ? <ChatSystemMessage key={r.key}>{r.m.text} · {core.timeFmt.format(new Date(r.m.date * 1000))}</ChatSystemMessage>
                    : <MessageRow key={r.key} m={r.m} group={r.group}
                        onReply={reply} onEdit={startEdit} onOpen={setViewer} onDelete={del} />)}
                </div>
              ))}
            </ChatMessageList>
          ) : null}
        </ChatLayout>
      </main>

      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={e => { pickFiles([...e.target.files]); e.target.value = ''; }} />
      {media && <Lightbox isOpen onOpenChange={o => { if (!o) setViewer(null); }} media={media} hasZoom={!viewer.video} hasAutoPlay />}
      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// Gün etiketinin yalnızca kendi gününün mesajları boyunca yapışık kalması için
function groupByDay(rows) {
  const out = [];
  for (const r of rows) {
    if (r.type === 'day') out.push({ key: r.key, label: r.label, items: [] });
    else out[out.length - 1]?.items.push(r);
  }
  return out;
}

const preview = m => (m.media ? (m.media.kind === 'video' ? 'Video' : 'Fotoğraf') : m.text);

// Mesajları gün ayraçları ve Apple tarzı gruplarla düzenler
function buildRows(list) {
  const rows = [];
  let prevDay = null;
  for (let i = 0; i < list.length; i++) {
    const m = list[i], d = new Date(m.date * 1000);
    if (!prevDay || !core.sameDay(prevDay, d)) rows.push({ type: 'day', key: 'd' + m.id, label: core.isToday(d) ? 'Bugün' : core.isYesterday(d) ? 'Dün' : core.dayFmt.format(d) });
    prevDay = d;
    if (m.system) { rows.push({ type: 'sys', key: m.id, m }); continue; }
    const joins = (a, b) => a && b && !a.system && !b.system && a.mine === b.mine && core.sameDay(new Date(a.date * 1000), new Date(b.date * 1000)) && Math.abs(a.date - b.date) < 180;
    const withPrev = joins(list[i - 1], m), withNext = joins(m, list[i + 1]);
    const group = withPrev && withNext ? 'middle' : withPrev ? 'last' : withNext ? 'first' : undefined;
    const showMeta = !withNext || m.status === 'failed' || m.mediaState === 'failed';
    rows.push({ type: 'msg', key: m.id, m, group, showMeta });
  }
  return rows;
}

function DoubleCheck({ read, single }) {
  return (
    <svg className={'pk-ticks' + (read ? ' read' : '')} viewBox="0 0 18 12" width="17" height="11" aria-hidden="true">
      <path d="M1.5 6.5l3.2 3.2L11 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {!single && <path d="M7.6 9.2l.5.5L14.5 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// Bekleyen silmeler: sayfa kapanırsa hemen uygulanır
const pendingDeletes = new Map();
addEventListener('pagehide', () => { for (const run of [...pendingDeletes.values()]) run(); });

// Mesajı sola kaydırınca yanıtla (Telegram/iMessage gibi). Dikey kaydırma bozulmaz;
// sol kenar iOS'un geri hareketine bırakılır. Aynı işlem basılı tutma menüsünde de var.
function SwipeToReply({ onReply, children, ...rest }) {
  const ref = useRef(null), st = useRef(null);
  const set = (x, anim) => {
    const el = ref.current; if (!el) return;
    el.style.transition = anim ? 'transform 380ms var(--spring-bouncy, ease-out)' : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
    el.style.setProperty('--pk-swipe', String(Math.min(1, Math.abs(x) / 56)));
  };
  const down = e => { if (e.pointerType === 'mouse' || !e.isPrimary) return; st.current = { x: e.clientX, y: e.clientY, dir: null, dx: 0, fired: false }; };
  const move = e => {
    const s = st.current; if (!s) return;
    const dx = s.x - e.clientX, dy = e.clientY - s.y;
    if (!s.dir) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; s.dir = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4 ? 'h' : 'v'; if (s.dir === 'h') { try { ref.current?.setPointerCapture(e.pointerId); } catch {} } }
    if (s.dir !== 'h') return;
    s.dx = Math.max(0, dx);
    const x = s.dx <= 56 ? s.dx : 56 + (s.dx - 56) * 0.25; // sınırdan sonra direnç
    if (!s.fired && s.dx > 56) { s.fired = true; navigator.vibrate?.(8); }
    set(-x, false);
  };
  const up = () => { const s = st.current; st.current = null; if (!s || s.dir !== 'h') return; set(0, true); if (s.dx > 56) onReply(); };
  return (
    <div ref={ref} className="pk-swipe" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} {...rest}>
      {children}
      <span className="pk-swipe-icon" aria-hidden="true"><Icon icon={ReplyIcon} size="sm" /></span>
    </div>
  );
}

function MessageRow({ m, group, onReply, onEdit, onOpen, onDelete }) {
  const time = core.timeFmt.format(new Date(m.date * 1000));
  const items = [
    { label: 'Yanıtla', icon: <Icon icon={ReplyIcon} />, onClick: () => onReply(m) },
    ...(m.text ? [{ label: 'Kopyala', icon: <Icon icon={CopyIcon} />, onClick: () => navigator.clipboard?.writeText(m.text).then(() => core.hooks.toast?.('Kopyalandı')).catch(() => {}) }] : []),
    ...(m.mine && !m.media && m.status !== 'failed' ? [{ label: 'Düzenle', icon: <Icon icon={PencilIcon} />, onClick: () => onEdit(m) }] : []),
    ...(m.status === 'failed' || m.mediaState === 'failed' ? [{ label: 'Tekrar dene', icon: <Icon icon={RetryIcon} />, onClick: () => core.retry(m) }] : []),
    { type: 'divider' },
    { label: 'Benden sil', icon: <Icon icon={TrashIcon} />, variant: 'destructive', onClick: () => onDelete(m, false) },
    { label: 'Herkesten sil', icon: <Icon icon={TrashIcon} />, variant: 'destructive', onClick: () => onDelete(m, true) }
  ];
  const ticks = !m.mine ? null
    : m.status === 'sending' ? <Icon icon={ClockIcon} size="xsm" />
    : m.status === 'failed' ? <Icon icon={AlertIcon} size="xsm" label="Gönderilemedi" />
    : m.status === 'read' ? <DoubleCheck read /> : <DoubleCheck single />;
  const meta = (
    <span className={'pk-meta' + (m.media ? ' on-media' : '')} aria-label={`${time}${m.mine ? ' · ' + ({ sending: 'Gönderiliyor', sent: 'Gönderildi', read: 'Okundu', failed: 'Gönderilemedi' }[m.status] || '') : ''}`}>
      {m.expiresAt && <Icon icon={TimerIcon} size="xsm" />}
      {m.edited && <span>düzenlendi</span>}
      <span>{time}</span>
      {ticks}
    </span>
  );
  const tail = group === undefined || group === 'last';
  const click = () => {
    if (m.status === 'failed' || m.mediaState === 'failed') core.retry(m);
  };

  return (
    <ContextMenu items={items} presentation="adaptive" label="Mesaj işlemleri" menuWidth="210px">
      <SwipeToReply onReply={() => onReply(m)}>
      <ChatMessage sender={m.mine ? 'user' : 'assistant'}>
        <ChatMessageBubble group={group} variant={m.media ? 'ghost' : 'filled'} onClick={click}
          className={(m.media ? 'pk-media-bubble' : '') + (tail && !m.media ? ' pk-tail' : '')}>
          <span id={'pk-' + m.id} className="pk-anchor" />
          {m.replyTo && <Quote m={m} />}
          {m.media
            ? <div className="pk-media-wrap"><MediaThumb m={m} onOpen={onOpen} />{meta}</div>
            : <span className="pk-text">{m.text}{meta}</span>}
        </ChatMessageBubble>
      </ChatMessage>
      </SwipeToReply>
    </ContextMenu>
  );
}

function Quote({ m }) {
  const r = core.byId(m.replyTo);
  const jump = e => { e.stopPropagation(); document.getElementById('pk-' + m.replyTo)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  return (
    <button type="button" className="pk-quote" onClick={jump}>
      <span className="pk-quote-name">{r ? (r.mine ? 'Sen' : core.displayPeer()) : 'Mesaj'}</span>
      <span className="pk-quote-text">{r ? preview(r) : 'Silinmiş mesaj'}</span>
    </button>
  );
}

function MediaThumb({ m, onOpen }) {
  const info = m.media, video = info.kind === 'video';
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    if (m.mediaState === 'ready') core.mediaURL(m, video).then(u => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [m.id, m.mediaState]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.min(280, window.innerWidth * 0.66);
  let W = max, H = max;
  if (info.w && info.h) { W = max; H = W * info.h / info.w; if (H > 360) { H = 360; W = H * info.w / info.h; } W = Math.max(W, 140); H = Math.max(H, 100); }
  const open = async e => {
    e.stopPropagation();
    if (m.mediaState === 'ready') { const url = await core.mediaURL(m); if (url) onOpen({ url, video }); }
    else if (m.mediaState === 'failed') core.retry(m);
  };
  let center = null;
  if (m.mediaState === 'uploading' || m.mediaState === 'downloading') center = <span className="pk-media-badge"><span className="pk-spinner" /></span>;
  else if (m.mediaState === 'failed') center = <span className="pk-media-badge"><Icon icon={m.mine ? UpIcon : DownIcon} /></span>;
  else if (m.mediaState === 'expired') center = <span className="pk-media-pill">Süresi doldu</span>;
  else if (video) center = <span className="pk-media-badge"><Icon icon={PlayIcon} /></span>;
  return (
    <button type="button" className="pk-media" style={{ width: W, height: H }} onClick={open} aria-label={video ? 'Videoyu aç' : 'Fotoğrafı aç'}>
      {info.thumb && !src && <img className="pk-media-ph" alt="" src={`data:image/jpeg;base64,${info.thumb}`} />}
      {src && <img className="pk-media-img" alt="" src={src} />}
      {video && info.dur ? <span className="pk-media-dur">{core.durText(info.dur)}</span> : null}
      {center && <span className="pk-media-center">{center}</span>}
    </button>
  );
}
