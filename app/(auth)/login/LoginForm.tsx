'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AuthFrame } from '../AuthFrame';

export function LoginForm({ displayName, version, instanceName, host, passwordChanged }: { displayName: string | null; version: string; instanceName: string; host: string; passwordChanged: boolean }) {
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
    <AuthFrame>
      <Card className="p-6 shadow-pb-3">
        <div className="text-center mb-5">
          <h1 className="text-[16px] font-semibold tracking-tight">
            Welcome back{displayName && `, ${displayName}`}
          </h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">Sign in to your personal ledger</div>
        </div>

        {passwordChanged && (
          <p role="status" className="mb-4 text-sm text-muted-foreground">Password updated. Sign in with your new password.</p>
        )}
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
                autoComplete="current-password"
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
              <div role="alert" className="mt-2 text-[12px] text-destructive flex items-center gap-1.5">
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

      <div className="text-center text-[11px] mt-4 text-muted-foreground">
        Self-hosted. One owner, no tracking. Just your numbers.
      </div>
    </AuthFrame>
  );
}
