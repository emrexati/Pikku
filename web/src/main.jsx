import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// iOS Safari klavye açılınca sayfayı yukarı kaydırır ve üst çubuk ekrandan çıkar.
// Uygulamayı görünen alana (visualViewport) oturtuyoruz: klavye açıkken de başlık yerinde kalır.
if (window.visualViewport) {
  const vv = window.visualViewport, root = document.documentElement;
  const fit = () => {
    root.style.setProperty('--vvh', vv.height + 'px');
    root.style.setProperty('--vvt', vv.offsetTop + 'px');
    if (vv.offsetTop > 0 && document.activeElement?.closest?.('.pk-composer')) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
}

// iOS Safari'de iki parmakla ve çift dokunarak yakınlaştırmayı engelle
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTouch < 300 && !e.target.closest('input, textarea, [contenteditable]')) e.preventDefault(); lastTouch = now; }, { passive: false });

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// Yerel testlerde çekirdeğe erişim (yayındaki sitede devre dışı)
if (location.hostname === 'localhost') import('./core.js').then(core => { window.__pk = core; });
