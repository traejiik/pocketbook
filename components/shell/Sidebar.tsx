'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  List,
  Repeat2,
  CalendarDays,
  Tag,
  Sparkles,
  Settings,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: List },
  { id: 'recurring',    label: 'Recurring',    icon: Repeat2 },
  { id: 'renewals',     label: 'Renewals',     icon: CalendarDays },
  { id: 'categories',   label: 'Categories',   icon: Tag },
  { id: 'insights',     label: 'AI Insights',  icon: Sparkles },
  { id: 'settings',     label: 'Settings',     icon: Settings },
];

interface SidebarProps {
  upcomingRenewalsCount?: number;
  onQuickAdd?: () => void;
}

export function Sidebar({ upcomingRenewalsCount = 1, onQuickAdd }: SidebarProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="w-[220px] shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden relative">
      {/* Decorative radial gradient */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 220 800"
        aria-hidden
      >
        <defs>
          <radialGradient id="sb-glow-top" cx="20%" cy="0%" r="80%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.09" />
            <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sb-glow-bot" cx="100%" cy="100%" r="70%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="220" height="800" fill="url(#sb-glow-top)" />
        <rect width="220" height="800" fill="url(#sb-glow-bot)" />
        <path
          d="M -20 380 Q 80 360, 120 420 T 260 480"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeOpacity="0.06"
          strokeWidth="40"
          strokeLinecap="round"
        />
      </svg>

      {/* Logo / branding */}
      <div className="relative px-3 pt-5 pb-3 flex items-center">
        {mounted ? (
          <img
            src={theme === 'dark' ? '/wordmark-dark.svg' : '/wordmark-light.svg'}
            alt="Pocketbook"
            className="h-9 w-auto"
            style={{ minWidth: '90%' }}
          />
        ) : (
          <div className="h-9" />
        )}
      </div>

      {/* Section label */}
      <div className="relative px-3 mt-2 mb-1.5">
        <div className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70 pl-2.5">
          Workspace
        </div>
      </div>

      {/* Nav items */}
      <nav className="relative px-2 flex-1 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(`/${item.id}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              className={cn(
                'group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-full text-[12.5px] transition-all relative',
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-pb-1'
                  : 'text-foreground/70 hover:text-foreground hover:bg-accent/60',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0',
                  active
                    ? 'bg-white/15'
                    : 'bg-secondary/60 border border-border group-hover:border-ring/30',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'renewals' && upcomingRenewalsCount > 0 && (
                <span
                  className={cn(
                    'font-mono text-[10px] rounded-full px-1.5 py-0.5 leading-none',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
                  )}
                >
                  {upcomingRenewalsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Quick add footer */}
      <div className="relative px-3 pb-3 mt-2">
        <button
          onClick={onQuickAdd}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/80 backdrop-blur-sm border border-border hover:border-ring/40 text-[12px] transition-colors"
        >
          <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Plus className="w-3 h-3" />
          </span>
          <span className="text-foreground/80">Quick add</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground border border-border rounded px-1">
            N
          </span>
        </button>
      </div>
    </aside>
  );
}
