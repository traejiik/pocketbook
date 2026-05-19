import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyProps {
  icon?: LucideIcon
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}

export function Empty({ icon: Icon = Wallet, title, body, action, className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-6', className)}>
      <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground mb-4">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-[15px] font-semibold tracking-tight">{title}</div>
      {body && <div className="text-[13px] text-muted-foreground mt-1 max-w-xs">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
