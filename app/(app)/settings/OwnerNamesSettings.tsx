'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/ui-notify';
import { saveOwnerNames } from '@/server-actions/owner-names';

export function OwnerNamesSettings({ displayName, instanceName }: { displayName: string; instanceName: string }) {
  const [display, setDisplay] = useState(displayName);
  const [instance, setInstance] = useState(instanceName);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const dirty = display.trim() !== displayName || instance.trim() !== instanceName;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    startTransition(async () => {
      try {
        const result = await saveOwnerNames(form);
        if (result.error !== undefined) {
          setError(result.error);
          return;
        }
        setDisplay(result.names.displayName ?? '');
        setInstance(result.names.instanceName ?? '');
        notify.success('Names saved');
      } catch {
        setError('Could not save your names. Try again.');
      }
    });
  }

  return (
    <section id="owner-names">
      <div className="mb-3 flex items-center gap-2">
        <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold tracking-tight">Profile &amp; instance</h2>
      </div>
      <form method="post" onSubmit={submit} className="calm-card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="owner-display-name">Display name</Label>
            <Input id="owner-display-name" name="displayName" autoComplete="name" maxLength={80}
              value={display} onChange={event => setDisplay(event.target.value)} readOnly={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-instance-name">Instance name</Label>
            <Input id="owner-instance-name" name="instanceName" maxLength={80}
              value={instance} onChange={event => setInstance(event.target.value)} readOnly={pending} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending || !dirty}>Save names</Button>
      </form>
    </section>
  );
}
