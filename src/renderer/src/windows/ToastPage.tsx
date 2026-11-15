import { useEffect, useState } from 'react'
import type { ToastPayload } from '../../../shared/types'

export function ToastPage() {
  const [payload, setPayload] = useState<ToastPayload | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const p = (await window.grabbit.getRoutePayload()) as ToastPayload | null
      setPayload(p)
      if (p?.path && p.kind === 'screenshot') {
        const url = (await window.grabbit.readFileDataUrl(p.path)) as string | null
        setThumb(url)
      }
      const t = setTimeout(() => window.grabbit.toastDismiss(), 6000)
      return () => clearTimeout(t)
    })()
  }, [])

  if (!payload) return null

  return (
    <button
      className="panel"
      onClick={() => window.grabbit.toastOpenAnnotate(payload.captureId)}
      style={{
        margin: 8,
        width: 'calc(100% - 16px)',
        height: 'calc(100% - 16px)',
        padding: 0,
        overflow: 'hidden',
        textAlign: 'left',
        background: 'rgba(24,24,28,0.94)'
      }}
    >
      <div style={{ height: 100, background: '#0a0a0b', display: 'grid', placeItems: 'center' }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="muted">{payload.kind === 'recording' ? 'Recording saved' : 'Screenshot saved'}</span>
        )}
      </div>
      <div style={{ padding: 10, fontWeight: 600 }}>Open in Grabbit</div>
    </button>
  )
}
