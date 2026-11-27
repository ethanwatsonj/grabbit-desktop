import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Cursor-style generating sheen — matches CursorStyleShimmerText.swift:
 * base glyph color + highlight duplicate masked by a sweeping gradient
 * (cycle 1.7s, center = phase * 1.6 - 0.3).
 */
export function ShimmerText({
  active,
  children,
  className = '',
  style,
  baseColor = 'var(--text-tertiary)',
  highlightColor = 'var(--text-secondary)'
}: {
  active: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
  baseColor?: string
  highlightColor?: string
}) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = ((now - start) / 1000) % 1.7
      setPhase(t / 1.7)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  if (!active) {
    return (
      <span className={`shimmer-text ${className}`.trim()} style={{ color: highlightColor, ...style }}>
        {children}
      </span>
    )
  }

  // Swift: center = phase * 1.6 - 0.3; band ±0.45
  const center = phase * 1.6 - 0.3
  const start = center - 0.45
  const end = center + 0.45
  const mid = (start + end) / 2
  const mask = `linear-gradient(90deg,
    transparent 0%,
    transparent ${pct(start)},
    rgba(255,255,255,0.35) ${pct(lerp(start, mid, 0.35))},
    #fff ${pct(mid)},
    rgba(255,255,255,0.35) ${pct(lerp(mid, end, 0.65))},
    transparent ${pct(end)},
    transparent 100%)`

  return (
    <span
      className={`shimmer-text is-active ${className}`.trim()}
      style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', ...style }}
      aria-label={typeof children === 'string' ? `${children}, auto-organizing` : undefined}
    >
      <span style={{ color: baseColor }}>{children}</span>
      <span
        aria-hidden
        className="shimmer-text__sheen"
        style={{
          position: 'absolute',
          inset: 0,
          color: highlightColor,
          WebkitMaskImage: mask,
          maskImage: mask,
          pointerEvents: 'none',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }}
      >
        {children}
      </span>
    </span>
  )
}

function pct(v: number): string {
  return `${Math.max(0, Math.min(1, v)) * 100}%`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
