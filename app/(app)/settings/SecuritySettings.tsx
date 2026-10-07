'use client';

import { useState, useTransition } from 'react';
import { Lock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { notify } from '@/lib/ui-notify';
import { cn } from '@/lib/utils';
import { changePassword } from '@/server-actions/settings';

function passwordStrength(pw: string): { bars: number; label: string } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bars = Math.min(4, Math.ceil(score * 0.8));
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { bars, label: labels[bars] ?? '' };
}

export function SecuritySettings() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [isPending, startTransition] = useTransition();

  const handlePasswordChange = () => {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 12) { toast.error('New password must be at least 12 characters'); return; }
    startTransition(async () => {
      const result = await changePassword({ current: currentPw, next: newPw });
      if (result.error) { toast.error(result.error); return; }
      notify.success('Password updated');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    });
  };

  const strength = passwordStrength(newPw);
  const barColours = ['bg-border', 'bg-destructive', 'bg-warning', 'bg-income', 'bg-income'];

  return (
    <div className="motion-stagger space-y-7">
      {/* ── Security ──────────────────────────────────────────────── */}
      <section id="security">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold tracking-tight">Security</h2>
        </div>
        <div className="calm-card p-6 space-y-4">
          <div>
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" placeholder="••••••••••••" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" placeholder="At least 12 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw-confirm">Confirm</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" placeholder="Repeat new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
          </div>
          {newPw.length > 0 && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className="flex gap-0.5">
                {[1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className={cn('w-6 h-1 rounded-full', i <= strength.bars ? barColours[strength.bars] : 'bg-border')}
                  />
                ))}
              </span>
              <span>{strength.label}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>Cancel</Button>
            <Button size="sm" onClick={handlePasswordChange} disabled={isPending || !currentPw || !newPw}>
              <Check className="w-3.5 h-3.5 mr-1.5" />Update password
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
