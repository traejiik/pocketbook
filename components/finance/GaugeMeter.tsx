import { useId } from 'react'

interface GaugeMeterProps {
  percent: number
}

export function GaugeMeter({ percent }: GaugeMeterProps) {
  const uid = useId()
  const hatchId = `gauge-hatch-${uid}`
  const fillId = `gauge-fill-${uid}`
  const titleId = `gauge-title-${uid}`

  const p = Math.max(0, Math.min(100, percent))
  const r = 100
  const cx = 140, cy = 150
  const arcLen = Math.PI * r
  const usedLen = (p / 100) * arcLen
  const arcD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[300px] block" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{`Income used: ${p}%`}</title>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="hsl(var(--secondary))" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="2.5" />
        </pattern>
        <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--income))" />
          <stop offset="100%" stopColor="hsl(var(--income))" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {/* Remaining hatched arc — drawn first, full arc */}
      <path d={arcD} fill="none" stroke={`url(#${hatchId})`} strokeWidth="44" strokeLinecap="round" />
      {/* Filled portion — animated draw-in via stroke-dashoffset */}
      <path
        d={arcD}
        fill="none"
        stroke={`url(#${fillId})`}
        strokeWidth="44"
        strokeLinecap="round"
        strokeDasharray={arcLen}
        strokeDashoffset={arcLen - usedLen}
        className="gauge-fill-arc"
        style={{
          '--gauge-arc': arcLen,
          '--gauge-offset': arcLen - usedLen,
        } as React.CSSProperties}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" fill="hsl(var(--foreground))" fontFamily="Geist, system-ui" fontSize="44" fontWeight="600" letterSpacing="-1">
        {p}%
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontFamily="Geist, system-ui" fontSize="12">
        of income used
      </text>
    </svg>
  )
}
