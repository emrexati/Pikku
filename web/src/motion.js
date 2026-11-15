import { flushSync } from 'react-dom';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tema değişimini dokunulan noktadan büyüyen bir daireyle gösterir (Telegram tarzı).
// View Transitions yoksa ya da hareket azaltma açıksa doğrudan uygular.
export function themeReveal(e, apply) {
  if (!document.startViewTransition || reduced()) { apply(); return; }
  const kb = !e || e.detail === 0 || e.clientX == null;
  const x = kb ? innerWidth / 2 : e.clientX, y = kb ? innerHeight / 2 : e.clientY;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(async () => {
    flushSync(apply);
    await new Promise(res => setTimeout(res, 0)); // tuval efektleri çizsin (rAF burada çalışmaz)
  });
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  }).catch(() => {});
}
