import { useRef, useState } from 'react'

export function RegionPage() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const selecting = useRef(false)

  const rect =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y)
        }
      : null

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.25)',
        cursor: 'crosshair',
        position: 'relative'
      }}
      onMouseDown={(e) => {
        selecting.current = true
        setStart({ x: e.screenX, y: e.screenY })
        setCurrent({ x: e.screenX, y: e.screenY })
      }}
      onMouseMove={(e) => {
        if (!selecting.current) return
        setCurrent({ x: e.screenX, y: e.screenY })
      }}
      onMouseUp={() => {
        selecting.current = false
        if (rect && rect.width > 2 && rect.height > 2) {
          window.grabbit.regionSelected(rect)
        } else {
          window.grabbit.regionCancel()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') window.grabbit.regionCancel()
      }}
      tabIndex={0}
    >
      {rect && (
        <div
          style={{
            position: 'fixed',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            border: '2px solid #7dd3a0',
            background: 'rgba(125,211,160,0.12)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)'
          }}
        />
      )}
      <div
        style={{
          position: 'fixed',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.7)'
        }}
      >
        Drag to select a region · Esc to cancel
      </div>
    </div>
  )
}
