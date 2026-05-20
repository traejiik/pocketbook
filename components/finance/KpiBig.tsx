import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpRight } from 'lucide-react'

type Tone = 'income' | 'expense' | 'savings' | 'neutral'

interface KpiBigProps {
  label: string
  value: number
  tone?: Tone
  deltaPct: string
  footnote: string
  href?: string
}

const toneVar: Record<Tone, string> = {
  income:  'hsl(var(--income))',
  expense: 'hsl(var(--expense))',
  savings: 'hsl(var(--savings))',
  neutral: 'hsl(var(--foreground))',
}

export function KpiBig({ label, value, tone = 'income', deltaPct, footnote, href }: KpiBigProps) {
  const abs = Math.abs(Math.round(value))
  const isNeg = value < 0
  const valueStr =
    abs >= 100_000
      ? `${Math.round(abs / 1000)}k`
      : abs.toLocaleString('hu-HU').replace(/,/g, ' ')

  const deltaDown = deltaPct.includes('−') || deltaPct.includes('-')
  const isStatic  = !deltaPct.match(/[\d%]/)

  return (
    <div className="rounded-2xl p-5 bg-card border border-border flex flex-col gap-4 min-h-[170px]">
      <div className="flex items-start justify-between">
        <div className="text-[14px] font-medium text-foreground">{label}</div>
        {href ? (
          <Link
            href={href}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground/80 hover:bg-accent transition"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground/80">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <div className="mt-auto">
        <div className="tabular font-semibold tracking-tight leading-none" style={{ color: toneVar[tone] }}>
          <span className="text-[44px]">{isNeg ? '−' : ''}{valueStr}</span>
          <span className="text-[16px] text-muted-foreground font-medium ml-1.5">Ft</span>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <span className="mono text-[10.5px] bg-secondary border border-border rounded-md px-1.5 py-0.5 inline-flex items-center gap-0.5 text-foreground/80">
            {!isStatic && (deltaDown
              ? <ArrowDown className="w-2.5 h-2.5" />
              : <ArrowUp className="w-2.5 h-2.5" />
            )}
            {deltaPct.replace('−', '').replace('-', '')}
          </span>
          <span className="text-[11px] text-muted-foreground">{footnote}</span>
        </div>
      </div>
    </div>
  )
}
