'use client';

import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { titleForPath } from '@/components/shell/nav';
import { NotificationsBell } from '@/components/shell/NotificationsBell';
import { ProfileMenu } from '@/components/shell/ProfileMenu';

// Mobile top bar (<md): large title + subtitle, sticky with blur and hairline.
export function MobileTopBar({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const title = titleForPath(pathname);
  const subtitle = format(new Date(), 'MMMM yyyy');

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-end justify-between gap-3 bg-background/90 backdrop-blur border-b border-border/55 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <div className="min-w-0">
        <h1 className="text-[21px] font-semibold tracking-tight leading-tight truncate">{title}</h1>
        <div className="text-[12px] text-muted-foreground mt-0.5 tabular">{subtitle}</div>
      </div>
      <div className="flex items-center gap-1.5 pb-0.5">
        <NotificationsBell />
        <ProfileMenu displayName={displayName} showName={false} />
      </div>
    </header>
  );
}
