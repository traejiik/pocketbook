import * as React from "react"
import { cn } from "@/lib/utils"

export type BadgeKind = 'income' | 'expense' | 'savings' | 'neutral' | 'primary' | 'warning'
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const kindClasses: Record<BadgeKind, string> = {
  income:  'bg-income/12 text-income border-income/25',
  expense: 'bg-expense/12 text-expense border-expense/25',
  savings: 'bg-savings/12 text-savings border-savings/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
  primary: 'bg-primary/12 text-primary border-primary/25',
  warning: 'bg-warning/12 text-warning border-warning/25',
}

const variantClasses: Record<BadgeVariant, string> = {
  default:     'bg-primary text-primary-foreground border-transparent',
  secondary:   'bg-secondary text-secondary-foreground border-transparent',
  destructive: 'bg-destructive/10 text-destructive border-destructive/25',
  outline:     'border-border text-foreground bg-transparent',
}

const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  kind?: BadgeKind
  color?: string
}

function Badge({ className, variant = 'default', kind, color, children, ...props }: BadgeProps) {
  if (color) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 rounded-full bg-secondary/60 border border-border px-2 py-0.5 text-[11.5px] text-foreground/85', className)}
        {...props}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        {children}
      </span>
    )
  }

  return (
    <span
      className={cn(base, kind ? kindClasses[kind] : variantClasses[variant], className)}
      {...props}
    >
      {children}
    </span>
  )
}

export { Badge }
