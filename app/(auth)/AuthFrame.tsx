import type { ReactNode } from 'react';
import { LogoMark } from '@/components/shell/LogoMark';

export function AuthFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="w-full min-h-dvh grid place-items-center relative overflow-hidden py-8">
      {/* Near-black backdrop */}
      <div className="absolute inset-0 pointer-events-none bg-background" />

      {/* SVG glow-grid background */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        <defs>
          <filter id="lp-halo" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="lp-edge" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <radialGradient id="lp-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity="0" />
            <stop offset="80%" stopColor="hsl(var(--background))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        {([
          [120, -60, 460, 240],
          [120, 460, 540, 240],
          [120, 1080, 460, 240],
          [380, -120, 420, 230],
          [380, 340, 460, 230],
          [380, 840, 420, 230],
          [380, 1280, 380, 230],
          [620, -80, 480, 230],
          [620, 460, 500, 230],
          [620, 1020, 480, 230],
        ] as [number, number, number, number][]).map(([y, x, w, h], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} rx={h * 0.45}
              fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.20" strokeWidth="2"
              filter="url(#lp-halo)" />
            <rect x={x} y={y} width={w} height={h} rx={h * 0.45}
              fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.24" strokeWidth="0.7"
              filter="url(#lp-edge)" />
          </g>
        ))}
        <rect width="1440" height="900" fill="url(#lp-vignette)" />
      </svg>

      {/* Faint currency glyphs */}
      <div className="absolute inset-0 pointer-events-none font-mono select-none text-primary">
        <span className="absolute top-[14%] left-[7%] text-[80px] font-light leading-none" style={{ opacity: 0.045 }}>€</span>
        <span className="absolute top-[68%] right-[10%] text-[64px] font-light leading-none" style={{ opacity: 0.055 }}>Ft</span>
        <span className="absolute bottom-[8%] left-[22%] text-[56px] font-light leading-none" style={{ opacity: 0.045 }}>$</span>
      </div>

      {/* Auth card */}
      <div className={`relative w-full px-4 ${wide ? 'max-w-[680px]' : 'max-w-[380px] sm:px-0'}`}>
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <LogoMark size={24} className="text-foreground" />
          <div className="text-[18px] font-semibold tracking-tight text-foreground">Pocketbook</div>
        </div>

        {children}
      </div>
    </div>
  );
}
