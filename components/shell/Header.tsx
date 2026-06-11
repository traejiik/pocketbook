'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Search, Bell, Sun, Moon, LogOut, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  upcomingRenewalsCount?: number;
  displayName?: string;
}

export function Header({ upcomingRenewalsCount = 0, displayName = 'User' }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchValue.trim()) {
      router.push(`/transactions?q=${encodeURIComponent(searchValue.trim())}`);
      setSearchValue('');
      searchRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setSearchValue('');
      searchRef.current?.blur();
    }
  }

  const dateLabel = format(new Date(), 'EEEE · dd MMM yyyy').toUpperCase();
  const email = session?.user?.email ?? '';
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="shrink-0 bg-card border border-border rounded-none sm:rounded-2xl px-3 sm:px-4 h-14 sm:h-[68px] flex items-center gap-2 sm:gap-4">
      {/* Date eyebrow — desktop only */}
      <div className="hidden lg:block pl-1 pr-2">
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
          {dateLabel}
        </div>
      </div>

      <div className="hidden lg:block w-px h-7 bg-border" />

      {/* Search — desktop only */}
      <div className="hidden sm:flex flex-1 max-w-[420px] relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          placeholder="Search transactions, subs, categories…"
          className="pl-9 pr-12 text-sm"
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onKeyDown={handleSearchKey}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground">
          ⌘K
        </span>
      </div>

      {/* Wordmark — mobile only */}
      <div className="sm:hidden flex-1">
        <Image
            src={mounted && resolvedTheme === 'light' ? '/wordmark-light.svg' : '/wordmark-dark.svg'}
            alt="Pocketbook"
            width={0}
            height={0}
            sizes="100vw"
            priority
            className="h-7 w-auto"
          />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Notification bell → renewals */}
        <Link
          href="/renewals"
          aria-label={upcomingRenewalsCount > 0 ? `${upcomingRenewalsCount} renewal${upcomingRenewalsCount !== 1 ? 's' : ''} due soon` : 'Renewals'}
          className="w-11 h-11 xl:w-9 xl:h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 relative"
        >
          <Bell className="w-4 h-4" />
          {upcomingRenewalsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-expense" />
          )}
        </Link>

        {/* Theme toggle — mounted guard prevents Sun/Moon SVG hydration mismatch */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
          className="w-11 h-11 xl:w-9 xl:h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {mounted
            ? theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
            : <span className="w-4 h-4" />}
        </button>

        <div className="hidden sm:block w-px h-6 bg-border mx-1.5" />

        {/* User chip with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="flex items-center gap-2.5 pr-1 rounded-full hover:opacity-90 transition outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[12px] font-semibold text-primary">
              {initial || 'U'}
            </div>
            <div className="hidden sm:block leading-tight text-left">
              <div className="text-[12.5px] font-medium">{displayName}</div>
              <div className="text-[10.5px] text-muted-foreground font-mono">{email}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card border border-border shadow-lg">
            <div className="px-2 py-1.5">
              <div className="text-[12.5px] font-medium">{displayName}</div>
              <div className="text-[11px] text-muted-foreground font-mono truncate">{email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="sm:hidden text-[13px] gap-2 cursor-pointer"
              onClick={() => router.push('/settings')}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem
              className="text-[13px] gap-2 cursor-pointer"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
