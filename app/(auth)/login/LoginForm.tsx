'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { LogoMark } from '@/components/shell/LogoMark';

export function LoginForm({ displayName, version, instanceName, host }: { displayName: string; version: string; instanceName: string; host: string }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { password, redirect: false });
    if (res?.error) {
      setError('That password is incorrect.');
      setLoading(false);
    } else {
      window.location.href = '/dashboard';
    }
  }

  return (
    <div className="w-full h-screen grid place-items-center relative overflow-hidden">
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

      {/* Login card */}
      <div className="relative w-full max-w-[380px] px-4 sm:px-0">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <LogoMark size={24} className="text-white" />
          <div className="text-[18px] font-semibold tracking-tight text-white">Pocketbook</div>
        </div>

        <Card className="p-6 shadow-pb-3">
          <div className="text-center mb-5">
            <div className="text-[16px] font-semibold tracking-tight">
              Welcome {displayName === 'back' ? 'back' : `back, ${displayName}`}
            </div>
            <div className="text-[12.5px] text-muted-foreground mt-1">Sign in to your personal ledger</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <Label htmlFor="pw">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  id="pw"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••••••"
                  className="pl-9 pr-9"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  aria-controls="pw"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
                >
                  {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {error && (
                <div className="mt-2 text-[12px] text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in
                </>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-income animate-pulse" />
              {instanceName && <>{instanceName} · </>}{host}
            </span>
            <span className="font-mono">{version}</span>
          </div>
        </Card>

        <div className="text-center text-[11px] mt-4 text-white/55">
          Self-hosted. No accounts, no tracking. Just your numbers.
        </div>
      </div>
    </div>
  );
}
