type Variant = 'solid' | 'mid' | 'hatch' | 'soft'

interface PillBarProps {
  /** Unused for sizing (the parent sets height); kept for call-site clarity. */
  height?: number
  color: string
  variant?: Variant
}

// v5 rounded-full vertical bar. `mid` = 50% opacity, `hatch`/`soft` = diagonal stripe.
export function PillBar({ color, variant = 'solid' }: PillBarProps) {
  if (variant === 'hatch' || variant === 'soft') {
    return (
      <div
        className="w-full h-full rounded-full border border-border"
        style={{
          background:
            'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.16) 0 3px, transparent 3px 7px)',
        }}
      />
    )
  }
  if (variant === 'mid') {
    return <div className="w-full h-full rounded-full" style={{ background: color, opacity: 0.5 }} />
  }
  return <div className="w-full h-full rounded-full" style={{ background: color }} />
}
