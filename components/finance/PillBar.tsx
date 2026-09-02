type Variant = 'solid' | 'mid' | 'hatch' | 'soft'

/**
 * The diagonal "remaining / not yet" stripe. Shared by the hatch pill, the dashboard's
 * resting chart and its empty horizontal tracks, so the pattern reads the same everywhere.
 */
export const HATCH_BACKGROUND =
  'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.16) 0 3px, transparent 3px 7px)'

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
        style={{ background: HATCH_BACKGROUND }}
      />
    )
  }
  if (variant === 'mid') {
    return <div className="w-full h-full rounded-full" style={{ background: color, opacity: 0.5 }} />
  }
  return <div className="w-full h-full rounded-full" style={{ background: color }} />
}
