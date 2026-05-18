'use client';

import { format } from 'date-fns';
import { Search, Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { signOut, useSession } from 'next-auth/react';
import { Input } from '@/components/ui/input';

interface HeaderProps {
  upcomingRenewalsCount?: number;
}

export function Header({ upcomingRenewalsCount = 0 }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();

  const dateLabel = format(new Date(), 'EEEE · dd MMM yyyy').toUpperCase();
  const email = session?.user?.email ?? '';
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="flex-shrink-0 bg-card border border-border rounded-2xl px-4 h-[68px] flex items-center gap-4">
      {/* Date eyebrow */}
      <div className="pl-1 pr-2">
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
          {dateLabel}
        </div>
      </div>

      <div className="w-px h-7 bg-border" />

      {/* Search — decorative for v1 */}
      <div className="flex-1 max-w-[420px] relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search transactions, subs, categories…"
          className="pl-9 pr-12 text-sm"
          readOnly
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground">
          ⌘K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Notification bell */}
        <button
          title="Renewals due soon"
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent relative"
        >
          <Bell className="w-4 h-4" />
          {upcomingRenewalsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-expense" />
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-border mx-1.5" />

        {/* User chip */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2.5 pr-1 hover:opacity-90 transition"
          title="Sign out"
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[12px] font-semibold text-primary">
            {initial || 'U'}
          </div>
          <div className="leading-tight text-left">
            <div className="text-[12.5px] font-medium">
              {process.env.NEXT_PUBLIC_USER_DISPLAY_NAME ?? 'User'}
            </div>
            <div className="text-[10.5px] text-muted-foreground font-mono">{email}</div>
          </div>
        </button>
      </div>
    </header>
  );
}
