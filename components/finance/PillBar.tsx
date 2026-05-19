type Variant = 'solid' | 'mid' | 'soft'

interface PillBarProps {
  height: number
  color: string
  variant?: Variant
}

export function PillBar({ height, color, variant = 'solid' }: PillBarProps) {
  if (variant === 'soft') {
    return (
      <div
        className="w-full h-full rounded-full border border-border"
        style={{ background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.18) 0 3px, transparent 3px 7px)' }}
      />
    )
  }
  if (variant === 'mid') {
    return <div className="w-full h-full rounded-full" style={{ background: color, opacity: 0.45 }} />
  }
  return <div className="w-full h-full rounded-full" style={{ background: color }} />
}
