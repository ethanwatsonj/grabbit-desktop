import { useEffect, useState } from 'react'
import hop0 from '../../assets/rabbit/RabbitHop0.png'
import hop1 from '../../assets/rabbit/RabbitHop1.png'
import hop2 from '../../assets/rabbit/RabbitHop2.png'
import hop3 from '../../assets/rabbit/RabbitHop3.png'
import hop4 from '../../assets/rabbit/RabbitHop4.png'
import menuBar from '../../assets/rabbit/MenuBarIcon.png'

const FRAME_SRCS = [hop4, hop3, hop2, hop1, hop0] as const
const FRAME_WEIGHTS = [1.2, 1.0, 1.4, 1.0, 1.2] as const
const TICK_MS = 100

type HopSize = 'button' | 'compact'

const SIZE_PX: Record<HopSize, { w: number; h: number }> = {
  button: { w: 28, h: 24 },
  compact: { w: 22, h: 19 }
}

function hopFrameIndex(elapsedMs: number): number {
  const total = FRAME_WEIGHTS.reduce((a, b) => a + b, 0)
  let unit = ((elapsedMs / TICK_MS) % total + total) % total
  let acc = 0
  for (let i = 0; i < FRAME_WEIGHTS.length; i++) {
    acc += FRAME_WEIGHTS[i]
    if (unit < acc) return i
  }
  return 0
}

export function RabbitIcon({ width = 18 }: { width?: number }) {
  const aspect = 30 / 14
  return (
    <img
      src={menuBar}
      alt=""
      width={width}
      height={width / aspect}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        filter: 'var(--rabbit-filter, none)'
      }}
      className="rabbit-icon"
    />
  )
}

/** Loops hop frames; when not animating shows MenuBarIcon (matches Swift RabbitHopLoader). */
export function RabbitHopLoader({
  size = 'button',
  isAnimating = true,
  width,
  height
}: {
  size?: HopSize
  isAnimating?: boolean
  width?: number
  height?: number
}) {
  const dims = SIZE_PX[size]
  const w = width ?? dims.w
  const h = height ?? dims.h
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!isAnimating) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      setFrame(hopFrameIndex(now - start))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isAnimating])

  const src = isAnimating ? FRAME_SRCS[frame] : menuBar

  return (
    <img
      src={src}
      alt={isAnimating ? 'Auto-organizing' : 'Auto Organize'}
      width={w}
      height={h}
      style={{
        display: 'block',
        width: w,
        height: h,
        objectFit: 'contain',
        imageRendering: 'pixelated',
        filter: 'var(--rabbit-filter, none)'
      }}
      className="rabbit-hop"
    />
  )
}
