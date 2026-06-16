import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpRight } from 'lucide-react'

type Tone = 'income' | 'expense' | 'savings' | 'neutral'

interface KpiBigProps {
  label: string
  value: number
  tone?: Tone
  deltaPct?: string
  footnote?: string
  href?: string
  currency?: string
  /** Tone-coloured radial glow background (v5 default on). */
  glow?: boolean
}

const toneVar: Record<Tone, string> = {
  income: 'hsl(var(--income))',
  expense: 'hsl(var(--expense))',
  savings: 'hsl(var(--savings))',
  neutral: 'hsl(var(--foreground))',
}

export function KpiBig({
  label,
  value,
  tone = 'income',
  deltaPct,
  footnote,
  href,
  currency = 'HUF',
  glow = true,
}: KpiBigProps) {
  const isNeg = value < 0
  const abs = Math.abs(value)
  const isHUF = currency === 'HUF'
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : null

  const valueStr = isHUF
    ? (() => {
        const r = Math.round(abs)
        return r >= 100_000 ? `${Math.round(r / 1000)}k` : r.toLocaleString('hu-HU').replace(/,/g, ' ')
      })()
    : abs.toFixed(2)

  const deltaClean = deltaPct ? deltaPct.replace('−', '').replace('-', '') : ''
  const deltaDown = deltaPct ? deltaPct.includes('−') || deltaPct.includes('-') : false
  const isStatic = deltaPct ? !deltaPct.match(/[\d%]/) : true

  const glowBg =
    glow && tone !== 'neutral'
      ? `radial-gradient(120% 100% at 16% 0%, hsl(var(--${tone}) / 0.10) 0%, transparent 58%), hsl(var(--card))`
      : undefined

  return (
    <div
      className="calm-card p-5 flex flex-col min-h-[148px]"
      style={glowBg ? { background: glowBg } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        {href && (
          <Link
            href={href}
            aria-label={`Open ${label}`}
            className="relative w-7 h-7 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:-inset-2 md:after:hidden"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-auto">
        <div className="tabular font-semibold tracking-tight leading-none" style={{ color: toneVar[tone] }}>
          {symbol ? (
            <>
              {isNeg && <span>−</span>}
              <span className="text-[15px] text-muted-foreground font-medium mr-1">{symbol}</span>
              <span className="text-[38px]">{valueStr}</span>
            </>
          ) : (
            <>
              <span className="text-[38px]">
                {isNeg ? '−' : ''}
                {valueStr}
              </span>
              <span className="text-[15px] text-muted-foreground font-medium ml-1.5">Ft</span>
            </>
          )}
        </div>
        {deltaPct && (
          <div
            className="flex items-center gap-1.5 mt-3.5 text-[11.5px] text-muted-foreground"
            aria-label={
              isStatic ? footnote : `${deltaDown ? 'Down' : 'Up'} ${deltaClean}, ${footnote}`
            }
          >
            {!isStatic && (
              <span aria-hidden="true" style={{ color: toneVar[tone] }}>
                {deltaDown ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
              </span>
            )}
            <span aria-hidden="true" className="tabular font-medium text-foreground/80">
              {deltaClean}
            </span>
            <span aria-hidden="true" className="truncate">
              {footnote}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
