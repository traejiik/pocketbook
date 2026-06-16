'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Search, Download } from 'lucide-react';
import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { notify } from '@/lib/ui-notify';
import { cn } from '@/lib/utils';
import { NotificationsBell } from '@/components/shell/NotificationsBell';
import { ProfileMenu } from '@/components/shell/ProfileMenu';
import { titleForPath, navIdForPath } from '@/components/shell/nav';

interface HeaderProps {
  displayName?: string;
  className?: string;
}

// Desktop / tablet header (md+): fixed title slot, centred search, right cluster.
export function Header({ displayName = 'User', className }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const title = titleForPath(pathname);
  const isTransactions = navIdForPath(pathname) === 'transactions';

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

  return (
    <header className={cn('h-[68px] shrink-0 items-center gap-4 pl-7 pr-6 relative z-30', className)}>
      {/* Fixed-width title slot — keeps search aligned across screens */}
      <div className="w-[148px] shrink-0">
        <h1 className="text-[17px] font-semibold tracking-tight whitespace-nowrap truncate">
          {title}
        </h1>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-[400px]">
        <label className="flex items-center gap-2.5 h-9 px-3.5 rounded-[10px] bg-card border border-border/50 focus-within:border-ring/50 transition-colors cursor-text">
          <Search className="w-[15px] h-[15px] text-muted-foreground" />
          <input
            ref={searchRef}
            className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-muted-foreground min-w-0"
            placeholder="Search transactions, subs, categories…"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKey}
          />
          <span className="mono text-[10px] text-muted-foreground">⌘K</span>
        </label>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isTransactions && (
          <button
            type="button"
            onClick={() => notify.success('Exported transactions.csv')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[12.5px] font-medium text-muted-foreground hover:text-foreground bg-card border border-border/50 hover:border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}
        <NotificationsBell />
        <ProfileMenu displayName={displayName} />
      </div>
    </header>
  );
}
