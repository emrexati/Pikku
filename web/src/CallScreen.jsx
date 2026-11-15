import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Icon } from '@astryxdesign/core/Icon';
import * as core from './core.js';
import { Call } from './core.js';
import { useCore } from './store.js';
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, FlipIcon, HangIcon, PhoneIcon } from './icons.jsx';

function Round({ label, icon, tone, active, onClick }) {
  return (
    <button type="button" className={'pk-cbtn' + (tone ? ' ' + tone : '') + (active ? ' on' : '')} onClick={onClick} aria-label={label} aria-pressed={active}>
      <span className="pk-cbtn-circle"><Icon icon={icon} size="lg" /></span>
      <span className="pk-cbtn-label">{label}</span>
    </button>
  );
}

function Stream({ stream, muted, className, version }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play?.().catch(() => {});
  }, [stream, version]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

export function CallScreen() {
  useCore();
  const [, tick] = useState(0);
  useEffect(() => {
    if (Call.state !== 'active') return;
    const t = setInterval(() => tick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [Call.state]);
  const audioRef = useRef(null);
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    if (el.srcObject !== Call.remote) el.srcObject = Call.remote || null;
    if (Call.remote) el.play().catch(() => {});
  });

  if (Call.state === 'idle') return <audio ref={audioRef} autoPlay hidden />;
  const name = core.displayPeer();
  const remoteOn = Call.video && Call.state === 'active' && !!Call.remote;
  const localOn = Call.video && !!Call.local && !Call.camOff;

  return (
    <div className={'pk-call' + (remoteOn ? ' video-on' : '')} role="dialog" aria-label="Arama">
      <audio ref={audioRef} autoPlay hidden />
      {remoteOn && <Stream stream={Call.remote} muted className="pk-remote" />}
      {localOn && <Stream stream={Call.local} muted version={Call.localVersion} className={'pk-local' + (Call.facing !== 'user' ? ' back' : '')} />}
      <div className="pk-call-head">
        {!remoteOn && <Avatar name={name} size={128} tooltip={false} />}
        <div className="pk-call-name">{name}</div>
        <div className="pk-call-status">{Call.status()}</div>
      </div>
      <div className={'pk-call-controls' + (Call.state === 'incoming' ? ' incoming' : '')}>
        {Call.state === 'incoming' ? (
          <>
            <Round label="Reddet" icon={HangIcon} tone="red" onClick={() => Call.reject()} />
            <Round label="Kabul et" icon={Call.video ? VideoIcon : PhoneIcon} tone="green" onClick={() => Call.accept()} />
          </>
        ) : (
          <>
            <Round label="Sessiz" icon={Call.muted ? MicOffIcon : MicIcon} active={Call.muted} onClick={() => Call.toggleMute()} />
            {Call.video && <Round label="Kamera" icon={Call.camOff ? VideoOffIcon : VideoIcon} active={Call.camOff} onClick={() => Call.toggleCam()} />}
            {Call.video && <Round label="Çevir" icon={FlipIcon} onClick={() => Call.flip()} />}
            <Round label="Bitir" icon={HangIcon} tone="red" onClick={() => Call.hangup()} />
          </>
        )}
      </div>
    </div>
  );
}
