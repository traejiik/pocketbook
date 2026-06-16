'use client';

import { usePathname } from 'next/navigation';
import { titleForPath } from '@/components/shell/nav';
import { NotificationsBell } from '@/components/shell/NotificationsBell';
import { ProfileMenu } from '@/components/shell/ProfileMenu';

// Mobile top bar (<md): large title, sticky with blur and hairline.
export function MobileTopBar({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/90 backdrop-blur border-b border-border/55 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <h1 className="text-[21px] font-semibold tracking-tight leading-tight truncate min-w-0">
        {title}
      </h1>
      <div className="flex items-center gap-1.5">
        <NotificationsBell />
        <ProfileMenu displayName={displayName} showName={false} />
      </div>
    </header>
  );
}
