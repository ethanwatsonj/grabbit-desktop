import { useEffect, useRef, useState } from 'react'
import type { AnnotatePayload } from '../../../shared/types'

type VideoTool = 'select' | 'zoom' | 'text'

interface Marker {
  t: number
  tool: VideoTool
  text?: string
  zoom?: number
}

export function VideoAnnotatePage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [payload, setPayload] = useState<AnnotatePayload | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [tool, setTool] = useState<VideoTool>('select')
  const [markers, setMarkers] = useState<Marker[]>([])
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    ;(async () => {
      const p = (await window.grabbit.getRoutePayload()) as AnnotatePayload | null
      setPayload(p)
      if (p?.path) {
        const url = (await window.grabbit.readFileDataUrl(p.path)) as string | null
        setSrc(url)
      }
    })()
  }, [])

  useEffect(() => {
    const active = [...markers].reverse().find((m) => m.t <= current && m.tool === 'zoom')
    setZoom(active?.zoom ?? 1)
  }, [current, markers])

  return (
    <div className="app-surface" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="titlebar-drag" style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border)' }}>
        {(['select', 'zoom', 'text'] as VideoTool[]).map((t) => (
          <button key={t} className={`btn titlebar-no-drag ${tool === t ? 'primary' : ''}`} onClick={() => setTool(t)}>
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="btn primary titlebar-no-drag"
          onClick={() => {
            // Export path: native helper will replace this with AnnotatedVideoExporter parity.
            window.alert(
              `Video export markers saved in-session (${markers.length}). Full re-encode ships via grabbit-helper AnnotatedVideoExporter parity.`
            )
          }}
        >
          Export
        </button>
      </header>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16, overflow: 'hidden' }}>
        {src ? (
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', overflow: 'hidden', borderRadius: 12 }}>
            <video
              ref={videoRef}
              src={src}
              controls
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                transform: `scale(${zoom})`,
                transformOrigin: 'center center'
              }}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
              onClick={() => {
                if (!videoRef.current) return
                const t = videoRef.current.currentTime
                if (tool === 'text') {
                  const text = window.prompt('Overlay text')
                  if (!text) return
                  setMarkers((m) => [...m, { t, tool, text }])
                } else if (tool === 'zoom') {
                  setMarkers((m) => [...m, { t, tool, zoom: 1.6 }])
                }
              }}
            />
            {markers
              .filter((m) => m.tool === 'text' && Math.abs(m.t - current) < 1.5)
              .map((m, idx) => (
                <div
                  key={`${m.t}-${idx}`}
                  style={{
                    position: 'absolute',
                    left: 24,
                    bottom: 64,
                    background: 'rgba(0,0,0,0.55)',
                    padding: '8px 12px',
                    borderRadius: 8
                  }}
                >
                  {m.text}
                </div>
              ))}
          </div>
        ) : (
          <div className="muted">Loading recording…</div>
        )}
      </div>

      <footer style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={current}
          onChange={(e) => {
            const t = Number(e.target.value)
            setCurrent(t)
            if (videoRef.current) videoRef.current.currentTime = t
          }}
          style={{ width: '100%' }}
        />
        <div className="muted" style={{ marginTop: 8 }}>
          {current.toFixed(1)}s / {duration.toFixed(1)}s · {markers.length} markers
          {payload ? ` · ${payload.captureId}` : ''}
        </div>
      </footer>
    </div>
  )
}
