'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, List, Tag, Sparkles, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Home',       icon: LayoutDashboard },
  { id: 'transactions', label: 'Txns',       icon: List },
  { id: 'recurring',   label: 'Recurring',  icon: Repeat2 },
  { id: 'categories',  label: 'Categories', icon: Tag },
  { id: 'insights',    label: 'Insights',   icon: Sparkles },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(`/${item.id}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
