'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useNotifications } from '@/contexts/notifications-context';

export function NotificationsBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { items, hasUnread, markAllRead } = useNotifications();

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) markAllRead();
      }}
    >
      <PopoverTrigger
        aria-label="Notifications"
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          open
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/70',
          className,
        )}
      >
        <Bell className="w-[17px] h-[17px]" />
        {hasUnread && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-expense" />}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[316px] p-0 gap-0 rounded-[14px] overflow-hidden shadow-pb-2"
      >
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <span className="text-[13px] font-semibold tracking-tight">Notifications</span>
          <span className="text-[10.5px] mono text-muted-foreground">{items.length} recent</span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 pb-4 text-[12px] text-muted-foreground">
            Nothing yet — activity will collect here.
          </div>
        ) : (
          <div className="pb-1.5 max-h-[320px] overflow-auto">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <div
                  key={it.id}
                  className="flex items-start gap-2.5 px-4 py-[9px] border-t border-border/40"
                >
                  <span
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-px',
                      it.unread
                        ? 'bg-primary/15 text-primary'
                        : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    <Icon className="w-3 h-3" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] leading-snug">{it.msg}</span>
                    <span className="block text-[10.5px] text-muted-foreground mt-0.5 tabular">
                      {it.time}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
