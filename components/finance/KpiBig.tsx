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
}

const toneVar: Record<Tone, string> = {
  income:  'hsl(var(--income))',
  expense: 'hsl(var(--expense))',
  savings: 'hsl(var(--savings))',
  neutral: 'hsl(var(--foreground))',
}

const toneSurface: Record<Tone, string> = {
  income:  'linear-gradient(135deg, hsl(var(--income) / 0.08) 0%, transparent 55%), hsl(var(--card))',
  expense: 'linear-gradient(135deg, hsl(var(--expense) / 0.08) 0%, transparent 55%), hsl(var(--card))',
  savings: 'linear-gradient(135deg, hsl(var(--savings) / 0.08) 0%, transparent 55%), hsl(var(--card))',
  neutral: 'hsl(var(--card))',
}

export function KpiBig({ label, value, tone = 'income', deltaPct, footnote, href }: KpiBigProps) {
  const abs = Math.abs(Math.round(value))
  const isNeg = value < 0
  const valueStr =
    abs >= 100_000
      ? `${Math.round(abs / 1000)}k`
      : abs.toLocaleString('hu-HU').replace(/,/g, ' ')

  const deltaDown = deltaPct ? deltaPct.includes('−') || deltaPct.includes('-') : false
  const isStatic  = deltaPct ? !deltaPct.match(/[\d%]/) : true

  return (
    <div
      className="rounded-2xl p-5 border border-border flex flex-col gap-4 min-h-[170px]"
      style={{ background: toneSurface[tone] }}
    >
      <div className="flex items-start justify-between">
        <div className="text-[14px] font-medium text-foreground">{label}</div>
        {href && (
          <Link
            href={href}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground/80 hover:bg-accent transition"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-auto">
        <div className="tabular font-semibold tracking-tight leading-none" style={{ color: toneVar[tone] }}>
          <span className="text-[44px]">{isNeg ? '−' : ''}{valueStr}</span>
          <span className="text-[16px] text-muted-foreground font-medium ml-1.5">Ft</span>
        </div>
        {deltaPct && (
          <div className="flex items-center gap-1.5 mt-3">
            <span
              className="mono text-[10.5px] bg-secondary border border-border rounded-md px-1.5 py-0.5 inline-flex items-center gap-0.5 text-foreground/80"
              aria-label={isStatic ? footnote : `${deltaDown ? 'Down' : 'Up'} ${deltaPct.replace('−', '').replace('-', '')} — ${footnote}`}
            >
              {!isStatic && (deltaDown
                ? <ArrowDown className="w-2.5 h-2.5" aria-hidden="true" />
                : <ArrowUp className="w-2.5 h-2.5" aria-hidden="true" />
              )}
              <span aria-hidden="true">{deltaPct.replace('−', '').replace('-', '')}</span>
            </span>
            <span className="text-[11px] text-muted-foreground" aria-hidden="true">{footnote}</span>
          </div>
        )}
      </div>
    </div>
  )
}
