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
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble, ChatMessageMetadata,
  ChatSystemMessage, ChatComposerInput, ChatSendButton
} from '@astryxdesign/core/Chat';
import * as core from './core.js';
import { S, Call } from './core.js';
import { Settings } from './Settings.jsx';
import { CallScreen } from './CallScreen.jsx';
import { Wallpaper } from './Wallpaper.jsx';
import {
  GearIcon, VideoIcon, PhoneIcon, PlusIcon, ReplyIcon, PencilIcon, CopyIcon, TrashIcon,
  RetryIcon, TimerIcon, PlayIcon, LockIcon, DownIcon, UpIcon
} from './icons.jsx';


// ---------------------------------------------------------------- kök
export default function App() {
  useCore();
  const [ready, setReady] = useState(false);
  useEffect(() => { core.init().then(() => setReady(true)); }, []);
  const mode = core.theme.mode === 1 ? 'light' : core.theme.mode === 2 ? 'dark' : 'system';
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
  useEffect(() => { core.hooks.toast = (body, ms) => show({ body, autoHideDuration: ms || 3500, uniqueID: String(body) }); return () => { core.hooks.toast = null; }; }, [show]);
  return null;
}

function Unsupported() {
  return (
    <div className="pk-center">
      <EmptyState title="Tarayıcın desteklenmiyor" description="Pikku için güncel Safari, Chrome, Edge veya Firefox gerekiyor." />
    </div>
  );
}

// ---------------------------------------------------------------- kurulum
function Setup() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = core.codeIsValid(code);
  const copy = () => navigator.clipboard?.writeText(code).then(() => core.hooks.toast?.('Kopyalandı')).catch(() => {});
  const start = async () => {
    setBusy(true);
    try { await core.setup(name, code); } catch { core.hooks.toast?.('Bu tarayıcı gerekli şifrelemeyi desteklemiyor'); setBusy(false); }
  };
  return (
    <div className="pk-center pk-scroll">
      <div className="pk-setup">
        <img className="pk-setup-logo" src="icon-192.png" alt="" />
        <Heading level={1} justify="center">Pikku</Heading>
        <Text type="supporting" as="p" justify="center" display="block">Yalnızca ikiniz için. Mesajlar, dosyalar ve aramalar uçtan uca şifreli.</Text>
        <div className="pk-form">
          <TextInput label="Adın" value={name} onChange={setName} placeholder="Örn. Emre" autoComplete="nickname" width="100%" size="lg" />
          <TextInput
            label="Eşleşme kodu" value={code} onChange={setCode} placeholder="XXXX-XXXX-XXXX-XXXX" width="100%" size="lg"
            autoCapitalize="characters" hasAutoCorrect={false} hasSpellCheck={false} controlClassName="pk-mono"
            status={code && !valid ? { type: 'error', message: 'Kod en az 12 harf veya rakam olmalı' } : undefined}
            description="Biriniz kod üretip diğerine güvenli bir yoldan iletsin; ikiniz de aynı kodu girin."
          />
          <div className="pk-row-between">
            <Button label="Yeni kod üret" variant="ghost" onClick={() => setCode(core.randomCode())} />
            <Button label="Kopyala" variant="ghost" icon={<Icon icon={CopyIcon} />} isDisabled={!code} onClick={copy} />
          </div>
          <Button label={busy ? 'Anahtar oluşturuluyor' : 'Başla'} variant="primary" size="lg" width="100%" isLoading={busy} isDisabled={!valid || !name.trim()} onClick={start} />
          <Text type="supporting" size="sm" as="p" justify="center" display="block">iPhone'daki Pikku ile aynı kod kullanılır; ikisi birbiriyle konuşur.</Text>
        </div>
      </div>
    </div>
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

  const name = S.peerName || 'Pikku';
  const status = core.peerStatus();
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

  const context = editing || replying;
  const canSend = !!draft.trim();
  const composer = (
    <div className="pk-composer">
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
    </div>
  );

  const rows = useMemo(() => buildRows(S.messages), [core.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = viewer && viewer.url ? { src: viewer.url, alt: viewer.video ? 'Video' : 'Fotoğraf', type: viewer.video ? 'video' : 'image' } : null;

  return (
    <div className="pk-app">
      <header className="pk-top">
        <IconButton label="Ayarlar" variant="ghost" icon={<Icon icon={GearIcon} size="lg" />} onClick={() => { core.snapshotTheme(); setSettingsOpen(true); }} />
        <div className="pk-peer">
          <Avatar name={name} size={40} tooltip={false} status={online ? <AvatarStatusDot variant="success" label="Çevrimiçi" /> : undefined} />
          <div className="pk-peer-text">
            <span className="pk-peer-name">{name}{S.ttl > 0 && <Icon icon={TimerIcon} size="sm" color="accent" label="Otomatik silme açık" />}</span>
            <span className={'pk-peer-status' + (online ? ' on' : '')}>{status}</span>
          </div>
        </div>
        <div className="pk-top-actions">
          <IconButton label="Görüntülü ara" variant="ghost" icon={<Icon icon={VideoIcon} size="lg" />} onClick={() => Call.start(true)} />
          <IconButton label="Sesli ara" variant="ghost" icon={<Icon icon={PhoneIcon} size="lg" />} onClick={() => Call.start(false)} />
        </div>
      </header>

      <div className="pk-chat">
        <ChatLayout
          composer={composer}
          emptyState={<EmptyState icon={<Icon icon={LockIcon} size="lg" />} title="Henüz mesaj yok" description="Karşı taraf aynı eşleşme koduyla giriş yaptığında mesajlarınız birbirine ulaşır." />}
        >
          {rows.length ? (
            <ChatMessageList>
              {rows.map(r => r.type === 'day'
                ? <ChatSystemMessage key={r.key} variant="divider">{r.label}</ChatSystemMessage>
                : r.type === 'sys'
                  ? <ChatSystemMessage key={r.key}>{r.m.text} · {core.timeFmt.format(new Date(r.m.date * 1000))}</ChatSystemMessage>
                  : <MessageRow key={r.key} m={r.m} group={r.group} showMeta={r.showMeta}
                      onReply={m => { setReplying(m); setEditing(null); }} onEdit={startEdit} onOpen={setViewer} />)}
            </ChatMessageList>
          ) : null}
        </ChatLayout>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={e => { pickFiles([...e.target.files]); e.target.value = ''; }} />
      {media && <Lightbox isOpen onOpenChange={o => { if (!o) setViewer(null); }} media={media} hasZoom={!viewer.video} hasAutoPlay />}
      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
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

const STATUS = { sending: 'sending', sent: 'sent', read: 'read', failed: 'error' };

function MessageRow({ m, group, showMeta, onReply, onEdit, onOpen }) {
  const time = core.timeFmt.format(new Date(m.date * 1000));
  const items = [
    { label: 'Yanıtla', icon: <Icon icon={ReplyIcon} />, onClick: () => onReply(m) },
    ...(m.text ? [{ label: 'Kopyala', icon: <Icon icon={CopyIcon} />, onClick: () => navigator.clipboard?.writeText(m.text).then(() => core.hooks.toast?.('Kopyalandı')).catch(() => {}) }] : []),
    ...(m.mine && !m.media && m.status !== 'failed' ? [{ label: 'Düzenle', icon: <Icon icon={PencilIcon} />, onClick: () => onEdit(m) }] : []),
    ...(m.status === 'failed' || m.mediaState === 'failed' ? [{ label: 'Tekrar dene', icon: <Icon icon={RetryIcon} />, onClick: () => core.retry(m) }] : []),
    { type: 'divider' },
    { label: 'Benden sil', icon: <Icon icon={TrashIcon} />, variant: 'destructive', onClick: () => core.deleteForMe(m) },
    { label: 'Herkesten sil', icon: <Icon icon={TrashIcon} />, variant: 'destructive', onClick: () => core.deleteForAll(m) }
  ];
  const footer = (m.edited || m.expiresAt) ? (
    <span className="pk-meta-extra">{m.expiresAt && <Icon icon={TimerIcon} size="xsm" />}{m.edited && 'düzenlendi'}</span>
  ) : undefined;
  const metadata = showMeta ? <ChatMessageMetadata timestamp={time} footer={footer} status={m.mine ? STATUS[m.status] : undefined} /> : undefined;
  const click = () => {
    if (m.status === 'failed' || m.mediaState === 'failed') core.retry(m);
  };

  return (
    <ContextMenu items={items} presentation="adaptive" label="Mesaj işlemleri" menuWidth="210px">
      <ChatMessage sender={m.mine ? 'user' : 'assistant'}>
        <ChatMessageBubble group={group} metadata={metadata} variant={m.media ? 'ghost' : 'filled'} onClick={click} className={m.media ? 'pk-media-bubble' : undefined}>
          <span id={'pk-' + m.id} className="pk-anchor" />
          {m.replyTo && <Quote m={m} />}
          {m.media ? <MediaThumb m={m} onOpen={onOpen} /> : <span className="pk-text">{m.text}</span>}
        </ChatMessageBubble>
      </ChatMessage>
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
