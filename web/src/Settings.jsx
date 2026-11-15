import { useEffect, useState } from 'react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Slider } from '@astryxdesign/core/Slider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Text } from '@astryxdesign/core/Text';
import * as core from './core.js';
import { S } from './core.js';
import { useCore } from './store.js';
import { WallThumb } from './Wallpaper.jsx';

function Group({ title, footer, children }) {
  return (
    <section className="pk-group">
      {title && <h3 className="pk-group-title">{title}</h3>}
      <div className="pk-group-body">{children}</div>
      {footer && <p className="pk-group-foot">{footer}</p>}
    </section>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const q = matchMedia('(max-width: 640px)'), f = () => setNarrow(q.matches);
    q.addEventListener?.('change', f); return () => q.removeEventListener?.('change', f);
  }, []);
  return narrow;
}

export function Settings({ isOpen, onClose }) {
  useCore();
  const narrow = useNarrow();
  const [d, setD] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { if (isOpen) { setD({ ...S.config }); setShowCode(false); } }, [isOpen]);
  if (!isOpen || !d) return null;

  const set = patch => setD(prev => ({ ...prev, ...patch }));
  const t = core.theme, dark = core.isDark();
  const cancel = () => { core.restoreTheme(); onClose(); };
  const save = async () => { await core.saveSettings(d); onClose(); };
  const toggleNotify = async v => { if (!v) return set({ notify: false }); set({ notify: await core.requestNotifications() }); };

  const confirms = {
    all: { title: 'Sohbeti iki taraftan da sil', description: 'Tüm mesajlar ve dosyalar iki cihazdan da silinecek.', action: 'İki taraftan da sil', run: core.clearForAll },
    me: { title: 'Sohbeti benden sil', description: 'Tüm mesajlar yalnızca bu cihazdan silinecek.', action: 'Benden sil', run: core.clearLocal },
    reset: { title: 'Eşleşmeyi sıfırla', description: 'Eşleşme kodu, anahtar ve tüm mesajlar bu cihazdan silinecek.', action: 'Sıfırla', run: core.resetPairing }
  };
  const c = confirm && confirms[confirm];

  return (
    <Dialog isOpen onOpenChange={o => { if (!o) cancel(); }} variant={narrow ? 'fullscreen' : 'standard'} width={560} maxHeight="88dvh" purpose="form" padding={0} aria-label="Ayarlar">
      <div className="pk-settings">
        <div className="pk-sheet-head">
          <Button label="Vazgeç" variant="ghost" onClick={cancel} />
          <Heading level={2} justify="center">Ayarlar</Heading>
          <span className="pk-sheet-done"><Button label="Bitti" variant="ghost" onClick={save} /></span>
        </div>
        <Group title="Profil">
          <div className="pk-pad"><TextInput label="Adın" isLabelHidden value={d.myName} onChange={v => set({ myName: v })} placeholder="Adın" width="100%" /></div>
        </Group>

        <Group title="Temalar" footer="Tema; arka planı, vurgu rengini, açık/koyu görünümü ve balon renklerini birlikte değiştirir.">
          <div className="pk-themes">
            <ThemeCard name="Klasik" index={9} dark={dark} on={core.isClassic()} colors={[0x007AFF, null]} onClick={core.resetTheme} />
            {core.WALLS.map((w, i) => w.preset ? (
              <ThemeCard key={i} name={w.name} index={i} dark={w.preset.mode === 1 ? false : w.preset.mode === 2 ? true : dark}
                on={core.presetActive(i)} colors={[w.preset.myBubble, w.preset.theirBubble]} onClick={() => core.applyPreset(i)} />
            ) : null)}
          </div>
        </Group>

        <Group title="Görünüm">
          <div className="pk-pad">
            <SegmentedControl label="Görünüm" value={String(t.mode)} onChange={v => core.setTheme({ mode: Number(v) })} layout="fill">
              <SegmentedControlItem value="0" label="Sistem" />
              <SegmentedControlItem value="1" label="Açık" />
              <SegmentedControlItem value="2" label="Koyu" />
            </SegmentedControl>
          </div>
          <div className="pk-pad">
            <Text display="block">Vurgu rengi</Text>
            <div className="pk-swatches">
              {core.ACCENTS.map(h => (
                <button key={h} type="button" className={'pk-swatch' + (h === t.accent ? ' on' : '')} style={{ background: core.toHex(h) }}
                  aria-label="Vurgu rengi" aria-pressed={h === t.accent} onClick={() => core.setTheme({ accent: h })} />
              ))}
            </div>
          </div>
          <div className="pk-pad">
            <Text display="block">Arka plan</Text>
            <div className="pk-walls">
              {core.PLAIN_WALLS.map(i => (
                <button key={i} type="button" className={'pk-wall' + (t.wallpaper === i ? ' on' : '')} onClick={() => core.selectWall(i)}>
                  <WallThumb index={i} dark={dark} className="pk-wall-canvas" />
                  <span>{core.WALLS[i].name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pk-pad">
            <Slider label={`Yazı boyutu · ${t.fontSize}`} value={t.fontSize} min={13} max={24} step={1} onChange={v => core.setTheme({ fontSize: v })} width="100%" />
          </div>
        </Group>

        <Group title="Mesaj renkleri">
          <ColorRow label="Benim balonum" k="myBubble" fallback="--pk-my-bubble-default" />
          <ColorRow label="Benim yazı rengim" k="myText" fallback="--pk-my-text-default" />
          <ColorRow label="Karşı tarafın balonu" k="theirBubble" fallback="--pk-their-bubble-default" />
          <ColorRow label="Karşı tarafın yazı rengi" k="theirText" fallback="--pk-their-text-default" />
          <div className="pk-preview">
            <WallThumb index={t.wallpaper} dark={dark} className="pk-preview-bg" />
            <div className="pk-pv pk-pv-theirs">Merhaba, nasılsın?</div>
            <div className="pk-pv pk-pv-mine">İyiyim, sen?</div>
          </div>
          <div className="pk-pad"><Button label="Varsayılan temaya dön" variant="secondary" width="100%" onClick={core.resetTheme} /></div>
        </Group>

        <Group title="Gizlilik ve güvenlik" footer="Çevrimiçi bilgini kapatırsan karşı tarafınkini de göremezsin. Otomatik silme iki cihazda da geçerli olur. Sohbet geçmişi bu tarayıcıda şifreli tutulur; bildirimlerde mesaj içeriği gösterilmez.">
          <div className="pk-pad"><Switch label="Çevrimiçi ve son görülme" value={!!d.showPresence} onChange={v => set({ showPresence: v })} labelPosition="start" labelSpacing="spread" width="100%" /></div>
          <div className="pk-pad"><Switch label="Okundu bilgisi gönder" value={!!d.readReceipts} onChange={v => set({ readReceipts: v })} labelPosition="start" labelSpacing="spread" width="100%" /></div>
          <div className="pk-pad"><Switch label="Masaüstü bildirimleri" value={!!d.notify} onChange={toggleNotify} labelPosition="start" labelSpacing="spread" width="100%" /></div>
          <div className="pk-row">
            <Text>Otomatik silme</Text>
            <Selector label="Otomatik silme" isLabelHidden variant="ghost" value={String(S.ttl)} onChange={v => core.setTTL(Number(v))}
              options={core.TTL_OPTIONS.map(([v, l]) => ({ value: String(v), label: l }))} presentation="adaptive" />
          </div>
        </Group>

        <Group title="Eşleşme kodu" footer="Kodu bilen herkes sohbete katılabilir.">
          <div className="pk-row">
            <span className="pk-mono pk-code">{showCode ? S.config.code : '••••-••••-••••-••••'}</span>
            <div className="pk-inline">
              <Button label={showCode ? 'Gizle' : 'Göster'} variant="ghost" size="sm" onClick={() => setShowCode(v => !v)} />
              <Button label="Kopyala" variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(S.config.code).then(() => core.hooks.toast?.('Kopyalandı')).catch(() => {})} />
            </div>
          </div>
        </Group>

        <Group title="Bağlantı" footer="Aktarma sunucusu iki tarafta da aynı olmalı. Mobil veride görüşme bağlanmazsa bir TURN sunucusu ekle.">
          <div className="pk-pad pk-stack">
            <TextInput label="Aktarma sunucusu" value={d.server} onChange={v => set({ server: v })} placeholder="https://ntfy.sh" inputMode="url" autoCapitalize="off" hasAutoCorrect={false} width="100%" />
            <TextInput label="TURN adresi" value={d.turnURL} onChange={v => set({ turnURL: v })} placeholder="turn:sunucu.com:3478" autoCapitalize="off" hasAutoCorrect={false} isOptional width="100%" />
            <TextInput label="TURN kullanıcı adı" value={d.turnUser} onChange={v => set({ turnUser: v })} autoCapitalize="off" hasAutoCorrect={false} isOptional width="100%" />
            <TextInput label="TURN şifresi" value={d.turnPass} onChange={v => set({ turnPass: v })} isOptional width="100%" controlClassName="pk-secret" />
          </div>
        </Group>

        <Group title="Sohbet">
          <div className="pk-pad pk-stack">
            <Button label="Sohbeti iki taraftan da sil" variant="destructive" width="100%" onClick={() => setConfirm('all')} />
            <Button label="Sohbeti yalnızca benden sil" variant="secondary" width="100%" onClick={() => setConfirm('me')} />
            <Button label="Eşleşmeyi sıfırla" variant="secondary" width="100%" onClick={() => setConfirm('reset')} />
          </div>
        </Group>
      </div>

      {c && (
        <AlertDialog isOpen onOpenChange={o => { if (!o) setConfirm(null); }} title={c.title} description={c.description}
          actionLabel={c.action} cancelLabel="Vazgeç" onAction={async () => { setConfirm(null); await c.run(); }} />
      )}
    </Dialog>
  );
}

function ThemeCard({ name, index, dark, on, colors, onClick }) {
  return (
    <button type="button" className={'pk-theme' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
      <span className="pk-theme-art">
        <WallThumb index={index} dark={dark} className="pk-theme-canvas" />
        <span className="pk-theme-bubbles">
          <i style={{ background: colors[1] != null ? core.toHex(colors[1]) : (dark ? '#2C2C2E' : '#E9E9EB') }} />
          <i className="mine" style={{ background: core.toHex(colors[0]) }} />
        </span>
      </span>
      <span className="pk-theme-name">{name}</span>
    </button>
  );
}

function ColorRow({ label, k, fallback }) {
  const v = core.theme[k];
  const current = v != null ? core.toHex(v) : toHexColor(getComputedStyle(document.documentElement).getPropertyValue(fallback));
  return (
    <label className="pk-row pk-color-row">
      <Text>{label}</Text>
      <input type="color" value={current} onChange={e => core.setTheme({ [k]: core.fromHex(e.target.value) })} aria-label={label} />
    </label>
  );
}

function toHexColor(v) {
  v = (v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = v.match(/\d+(\.\d+)?/g);
  return m ? '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('') : '#000000';
}
