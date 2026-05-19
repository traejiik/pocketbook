'use client'

import { cn } from '@/lib/utils'
import type { Currency } from '@/lib/fx'

type AmountTone = 'income' | 'expense' | 'savings' | 'neutral'
type AmountSize = 'sm' | 'md' | 'lg' | 'xl'

interface AmountDisplayProps {
  value: number
  currency?: Currency
  tone?: AmountTone
  size?: AmountSize
  signed?: boolean
  className?: string
}

const sizes: Record<AmountSize, string> = {
  sm: 'text-[15px]',
  md: 'text-[20px]',
  lg: 'text-[28px]',
  xl: 'text-[34px]',
}

const tones: Record<AmountTone, string> = {
  income:  'text-income',
  expense: 'text-expense',
  savings: 'text-savings',
  neutral: 'text-foreground',
}

export function AmountDisplay({
  value,
  currency = 'HUF',
  tone = 'neutral',
  size = 'md',
  signed = false,
  className,
}: AmountDisplayProps) {
  const sign = signed && value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value)

  let numStr: string
  if (currency === 'HUF') numStr = Math.round(abs).toLocaleString('hu-HU').replace(/,/g, ' ')
  else numStr = abs.toFixed(2)

  const symbol = currency === 'HUF' ? 'Ft' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency
  const prefix = currency !== 'HUF'

  return (
    <span className={cn('tabular font-semibold tracking-tight', sizes[size], tones[tone], className)}>
      {sign}
      {prefix && <span className="text-foreground/55 font-normal mr-0.5">{symbol}</span>}
      {numStr}
      {!prefix && <span className="text-foreground/55 font-normal ml-1.5 text-[0.62em]">{symbol}</span>}
    </span>
  )
}
