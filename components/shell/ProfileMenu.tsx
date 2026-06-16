'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface ProfileMenuProps {
  displayName?: string;
  showName?: boolean;
  className?: string;
}

export function ProfileMenu({ displayName = 'User', showName = true, className }: ProfileMenuProps) {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const email = session?.user?.email ?? '';
  const initial = email.charAt(0).toUpperCase() || 'U';

  const triggerClasses = cn(
    'flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
    open ? 'bg-accent' : 'hover:bg-accent/70',
    className,
  );

  const triggerInner: ReactNode = (
    <>
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-primary bg-primary/15">
        {initial}
      </span>
      {showName && <span className="text-[12.5px] font-medium">{displayName}</span>}
      <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
    </>
  );

  const body = (
    <>
      <div className="px-4 pt-3.5 pb-3">
        <div className="text-[13px] font-semibold tracking-tight">{displayName}</div>
        <div className="mono text-[11px] text-muted-foreground mt-1 truncate">{email}</div>
      </div>
      <div className="px-4 py-3 border-t border-border/45">
        <div className="text-[11px] font-medium text-muted-foreground mb-2">Appearance</div>
        <div className="flex items-center bg-secondary/80 rounded-[10px] p-[3px]">
          {(['dark', 'light'] as const).map((m) => {
            const Icon = m === 'dark' ? Moon : Sun;
            const selected = mounted && theme === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setTheme(m)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 h-[28px] rounded-[8px] text-[12px] capitalize transition-colors',
                  selected ? 'bg-card text-foreground font-medium shadow-pb-1' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {m}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-1.5 border-t border-border/45">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label="Account menu" className={triggerClasses}>
          {triggerInner}
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-[402px] rounded-t-2xl gap-0 p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Account</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label="Account menu" className={triggerClasses}>
        {triggerInner}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[230px] p-0 gap-0 rounded-[14px] overflow-hidden shadow-pb-2"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
