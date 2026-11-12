'use client';

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordIssue } from '@/lib/owner/password-policy';
import { createOwner, generateSetupCode } from '@/server-actions/setup';
import { AuthFrame } from '../AuthFrame';

const details = [
  { name: 'displayName', label: 'Display name', autoComplete: 'name', maxLength: 80 },
  { name: 'instanceName', label: 'Instance name', maxLength: 80 },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', maxLength: 254 },
] as const;
const themes = ['dark', 'light'] as const;
const mismatchMessage = 'Passwords do not match.';

function FieldFeedback({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  return (
    <div id={id} aria-live="polite">
      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SetupForm({ initialCodeExpiry }: { initialCodeExpiry: number | null }) {
  const { theme, setTheme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [codeRejected, setCodeRejected] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState(initialCodeExpiry);
  const [codeNotice, setCodeNotice] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const welcomeHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const getStarted = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const selectedTheme = theme === 'light' ? 'light' : 'dark';
  const passwordError = password ? passwordIssue(password) : undefined;
  const confirmationError = confirmation && confirmation !== password ? mismatchMessage : undefined;
  const busy = pending || refreshing;

  useEffect(() => {
    if (codeExpiry === null) return;
    const timer = window.setTimeout(() => setCodeExpiry(null), Math.max(0, codeExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [codeExpiry]);

  useEffect(() => {
    if (showForm) formHeading.current?.focus();
    else if (document.activeElement === document.body) welcomeHeading.current?.focus();
  }, [showForm]);

  function back() {
    setShowForm(false);
    requestAnimationFrame(() => getStarted.current?.focus());
  }

  function refreshCode() {
    setRefreshError('');
    startRefresh(async () => {
      try {
        const result = await generateSetupCode();
        if (result.status === 'configured') {
          window.location.replace('/login');
        } else if (result.status === 'error') {
          setRefreshError(result.error);
        } else {
          setCodeExpiry(result.expiresAt);
          setCodeRejected(false);
          setCodeNotice(result.status === 'issued'
            ? 'Check the Pocketbook web container logs for your new setup code.'
            : 'A setup code is already active. Check the Pocketbook web container logs.');
          codeInput.current?.focus();
        }
      } catch {
        setRefreshError('Could not generate a setup code. Try again.');
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const submittedPassword = String(form.get('password') ?? '');
    const submittedConfirmation = String(form.get('confirmPassword') ?? '');
    setPassword(submittedPassword);
    setConfirmation(submittedConfirmation);
    setError('');
    setCodeRejected(false);
    const invalidField = passwordIssue(submittedPassword)
      ? 'password'
      : submittedPassword !== submittedConfirmation ? 'confirmPassword' : null;
    if (invalidField) {
      (event.currentTarget.elements.namedItem(invalidField) as HTMLInputElement | null)?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createOwner(form);
      if (result.error) {
        if (result.field === 'code') {
          setCodeRejected(true);
          codeInput.current?.focus();
        } else {
          setError(result.error);
        }
        return;
      }
      setTheme(selectedTheme);
      window.location.replace('/login');
    });
  }

  return (
    <AuthFrame wide>
      <div className={showForm ? 'hidden' : 'mx-auto max-w-[460px]'}>
        <Card className="gap-6 p-6 text-center shadow-pb-3 sm:p-8">
          <header className="space-y-2">
            <h1 ref={welcomeHeading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              Welcome to Pocketbook
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create your account and name this instance to start tracking your finances.
            </p>
          </header>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
            Find your setup code under <code className="text-foreground">[setup]</code> in the container logs.
            It expires after 30 minutes.
          </p>
          <Button ref={getStarted} type="button" size="lg" onClick={() => setShowForm(true)}>
            Get started <ArrowRight aria-hidden="true" />
          </Button>
        </Card>
      </div>
      <div className={showForm ? undefined : 'hidden'}>
        <Card className="gap-5 p-6 shadow-pb-3 sm:p-8">
          <header className="space-y-1">
            <h1 ref={formHeading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              Set up your account
            </h1>
            <p className="text-sm text-muted-foreground">Use the one-time setup code for this instance.</p>
          </header>
          <form method="post" onSubmit={submit} className="space-y-5">
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="code">Setup code</Label>
                <div className="flex items-center gap-2">
                  <Input ref={codeInput} id="code" name="code" type="password" autoComplete="off" required readOnly={busy}
                    className="flex-1" aria-describedby="code-feedback" aria-invalid={codeRejected}
                    onChange={() => setCodeRejected(false)} />
                  {codeExpiry === null && (
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={refreshCode} disabled={busy}>
                      {refreshing ? 'Generating code…' : 'Generate new code'}
                    </Button>
                  )}
                </div>
                <FieldFeedback id="code-feedback"
                  error={refreshError || (codeRejected ? 'Check the code and try again.' : undefined)}
                  hint={codeExpiry === null
                    ? 'Generate a code to find it under [setup] in the Pocketbook web container logs.'
                    : codeNotice || 'Find your code under [setup] in the Pocketbook web container logs.'} />
              </div>
              {details.map(({ name, label, ...props }) => (
                <div key={name} className={name === 'email' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                  <Label htmlFor={name}>{label}</Label>
                  <Input {...props} id={name} name={name} required />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" required
                  aria-describedby="password-feedback" aria-invalid={!!passwordError}
                  onChange={event => setPassword(event.target.value)} />
                <FieldFeedback id="password-feedback" error={passwordError} hint="At least 12 characters." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required
                  aria-describedby="confirmation-feedback" aria-invalid={!!confirmationError}
                  onChange={event => setConfirmation(event.target.value)} />
                <FieldFeedback id="confirmation-feedback" error={confirmationError} />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Theme</legend>
              <div className="flex gap-2">
                {themes.map(option => (
                  <label key={option} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm capitalize has-checked:border-primary">
                    <input type="radio" name="theme" value={option} checked={option === selectedTheme}
                      onChange={() => setTheme(option)} className="accent-primary" />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" size="lg" onClick={back} disabled={busy}>
                <ArrowLeft aria-hidden="true" /> Back
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {pending ? 'Creating account…' : 'Create Account'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AuthFrame>
  );
}
