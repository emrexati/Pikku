import { useEffect, useRef } from 'react';
import * as core from './core.js';
import { useCore } from './store.js';

// Sohbetin arkasındaki çizimli tema (Sade temada düz beyaz/siyah).
export function Wallpaper() {
  useCore();
  const ref = useRef(null);
  const index = core.theme.wallpaper, dark = core.isDark();
  useEffect(() => {
    const draw = () => ref.current && core.paintWall(ref.current, index, dark);
    draw();
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(draw, 120); };
    addEventListener('resize', onResize);
    return () => { removeEventListener('resize', onResize); clearTimeout(t); };
  }, [index, dark]);
  const themed = !!core.WALLS[index]?.preset;
  return (
    <>
      <canvas ref={ref} className="pk-wallpaper" aria-hidden="true" />
      {themed && <div className={'pk-scrim' + (dark ? ' dark' : '')} aria-hidden="true" />}
    </>
  );
}

// Ayarlardaki küçük önizlemeler için
export function WallThumb({ index, dark, className }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) core.paintWall(ref.current, index, dark); }, [index, dark]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
