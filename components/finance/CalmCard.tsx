import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// v5 surface: 16px radius, hairline border (via the .calm-card utility).
export function CalmCard({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('calm-card', className)} {...rest}>
      {children}
    </div>
  );
}

interface CalmCardHeadProps {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}

export function CalmCardHead({ title, sub, right }: CalmCardHeadProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold tracking-tight">{title}</div>
        {sub ? <div className="text-[11.5px] text-muted-foreground mt-1">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}
