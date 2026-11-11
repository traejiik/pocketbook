'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createOwner } from '@/server-actions/setup';
import { AuthFrame } from '../AuthFrame';

const fields = [
  { name: 'code', label: 'Setup code', type: 'password', autoComplete: 'off' },
  { name: 'displayName', label: 'Display name', autoComplete: 'name', maxLength: 80 },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', maxLength: 254 },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', minLength: 12 },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
  { name: 'instanceName', label: 'Instance name', maxLength: 80 },
] as const;

export function SetupForm() {
  const { setTheme } = useTheme();
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    startTransition(async () => {
      const result = await createOwner(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTheme(form.get('theme') === 'light' ? 'light' : 'dark');
      window.location.replace('/login');
    });
  }

  return (
    <AuthFrame>
      <Card className="gap-4 p-6 shadow-pb-3">
        <header className="space-y-1 text-center">
          <h1 className="text-base font-semibold tracking-tight">Set up Pocketbook</h1>
          <p className="text-sm text-muted-foreground">Get a setup code from your instance operator.</p>
        </header>
        <form method="post" onSubmit={submit} className="space-y-3.5">
          {fields.map(({ name, label, ...props }) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Input {...props} id={name} name={name} required />
              {name === 'password' && <p className="text-xs text-muted-foreground">At least 12 characters.</p>}
            </div>
          ))}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Theme</legend>
            <div className="flex gap-2">
              {['dark', 'light'].map(theme => (
                <label key={theme} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm capitalize has-checked:border-primary">
                  <input type="radio" name="theme" value={theme} defaultChecked={theme === 'dark'} className="accent-primary" />
                  {theme}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? 'Creating owner…' : 'Create owner'}
          </Button>
        </form>
      </Card>
    </AuthFrame>
  );
}
