import { useEffect, useRef, useState } from 'react'
import type { AnnotatePayload } from '../../../shared/types'
import { ANNOTATION_PALETTE } from '../design/tokens'

type Tool = 'select' | 'spotlight' | 'crop' | 'text' | 'sticker' | 'draw' | 'arrow' | 'rect'

interface Stroke {
  tool: Tool
  color: string
  width: number
  points: Array<{ x: number; y: number }>
  text?: string
  emoji?: string
}

/* DesignTokens.Color.annotationPalette solids */
const COLORS = [...ANNOTATION_PALETTE]
const STICKERS = ['🔥', '✅', '❌', '👀', '💡', '🎯', '📎', '🐰']

export function AnnotatePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [payload, setPayload] = useState<AnnotatePayload | null>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(COLORS[0])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [draft, setDraft] = useState<Stroke | null>(null)
  const [bg, setBg] = useState<'none' | 'warm' | 'cool' | 'midnight'>('none')
  const [sideBySide, setSideBySide] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const p = (await window.grabbit.getRoutePayload()) as AnnotatePayload | null
      setPayload(p)
      if (p?.path) {
        const url = (await window.grabbit.readFileDataUrl(p.path)) as string | null
        setImageUrl(url)
      }
    })()
  }, [])

  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      redraw()
    }
    img.src = imageUrl
  }, [imageUrl, strokes, draft, bg, sideBySide])

  const redraw = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const maxW = sideBySide ? 520 : 1000
    const scale = Math.min(1, maxW / img.width)
    canvas.width = Math.round(img.width * scale) * (sideBySide ? 2 : 1) + (sideBySide ? 16 : 0)
    canvas.height = Math.round(img.height * scale)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const paintBg = () => {
      if (bg === 'none') {
        ctx.fillStyle = '#0b0b0c'
      } else if (bg === 'warm') {
        ctx.fillStyle = '#2a1d14'
      } else if (bg === 'cool') {
        ctx.fillStyle = '#14202a'
      } else {
        ctx.fillStyle = '#0a0a12'
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    paintBg()

    const drawImageAt = (ox: number) => {
      ctx.drawImage(img, ox, 0, Math.round(img.width * scale), Math.round(img.height * scale))
    }

    if (sideBySide) {
      drawImageAt(0)
      drawImageAt(Math.round(img.width * scale) + 16)
    } else {
      drawImageAt(0)
    }

    const all = draft ? [...strokes, draft] : strokes
    for (const stroke of all) {
      drawStroke(ctx, stroke, scale)
    }
  }

  const toCanvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toCanvasPoint(e)
    if (tool === 'text') {
      const text = window.prompt('Text')
      if (!text) return
      setStrokes((s) => [...s, { tool, color, width: 2, points: [p], text }])
      return
    }
    if (tool === 'sticker') {
      const emoji = STICKERS[0]
      setStrokes((s) => [...s, { tool, color, width: 2, points: [p], emoji }])
      return
    }
    if (tool === 'spotlight') {
      setStrokes((s) => [...s, { tool, color, width: 120, points: [p] }])
      return
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDraft({ tool, color, width: tool === 'draw' ? 3 : 2, points: [p] })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draft) return
    const p = toCanvasPoint(e)
    setDraft({ ...draft, points: [...draft.points, p] })
  }

  const onPointerUp = () => {
    if (!draft) return
    setStrokes((s) => [...s, draft])
    setDraft(null)
  }

  const exportPng = async () => {
    const canvas = canvasRef.current
    if (!canvas || !payload) return
    const dataUrl = canvas.toDataURL('image/png')
    await window.grabbit.annotateSave(payload.captureId, dataUrl)
  }

  const cropToSelection = () => {
    const last = [...strokes].reverse().find((s) => s.tool === 'rect' || s.tool === 'crop')
    const canvas = canvasRef.current
    if (!last || !canvas || last.points.length < 2) return
    const a = last.points[0]
    const b = last.points[last.points.length - 1]
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)
    const tmp = document.createElement('canvas')
    tmp.width = Math.max(1, Math.round(w))
    tmp.height = Math.max(1, Math.round(h))
    const ctx = tmp.getContext('2d')
    if (!ctx) return
    ctx.drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height)
    const url = tmp.toDataURL('image/png')
    setImageUrl(url)
    setStrokes([])
  }

  const tools: { id: Tool; label: string; symbol: string }[] = [
    { id: 'select', label: 'Select', symbol: '↖' },
    { id: 'spotlight', label: 'Spotlight', symbol: '◎' },
    { id: 'crop', label: 'Crop', symbol: '⬚' },
    { id: 'text', label: 'Text', symbol: 'T' },
    { id: 'sticker', label: 'Sticker', symbol: '☺' },
    { id: 'draw', label: 'Draw', symbol: '✎' },
    { id: 'arrow', label: 'Arrow', symbol: '→' },
    { id: 'rect', label: 'Rectangle', symbol: '▭' }
  ]

  return (
    <div className="app-surface annotate-page">
      <div className="titlebar-drag annotate-page__drag" />

      <div className="annotate-page__stage">
        <div
          className="annotate-page__canvas-wrap"
          style={
            bg === 'none'
              ? undefined
              : {
                  background:
                    bg === 'warm'
                      ? 'linear-gradient(135deg, var(--grad-warm-from), var(--grad-warm-to))'
                      : bg === 'cool'
                        ? 'linear-gradient(135deg, var(--grad-cool-from), var(--grad-cool-to))'
                        : 'linear-gradient(135deg, var(--grad-midnight-from), var(--grad-midnight-to))',
                  padding: sideBySide ? 24 : 16
                }
          }
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              cursor: 'crosshair',
              borderRadius: sideBySide ? 8 : 0,
              boxShadow: sideBySide ? 'var(--elevation-raised)' : undefined
            }}
          />
        </div>
      </div>

      {tool === 'sticker' ? (
        <div className="annotate-page__stickers titlebar-no-drag">
          {STICKERS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="btn compact"
              onClick={() => {
                setStrokes((s) => [
                  ...s,
                  { tool: 'sticker', color, width: 2, points: [{ x: 80, y: 80 }], emoji }
                ])
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      <div className="annotate-page__chrome titlebar-no-drag">
        <div className="ks-toolbar-pill annotate-toolbar">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? 'is-active' : ''}
              title={t.label}
              onClick={() => setTool(t.id)}
            >
              {t.symbol}
            </button>
          ))}
          <span className="ks-toolbar-pill__sep" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`ks-color-btn ${color === c ? 'is-selected' : ''}`}
              style={{ background: c, width: 20, height: 20, margin: 4 }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="annotate-page__actions">
          <select
            className="soft-control"
            value={bg}
            onChange={(e) => setBg(e.target.value as typeof bg)}
          >
            <option value="none">No background</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="midnight">Midnight</option>
          </select>
          <button
            type="button"
            className={`btn compact ${sideBySide ? 'primary' : ''}`}
            onClick={() => setSideBySide((v) => !v)}
          >
            Side by side
          </button>
          {tool === 'crop' ? (
            <button type="button" className="btn compact" onClick={cropToSelection}>
              Apply crop
            </button>
          ) : null}
          <button type="button" className="btn compact" onClick={() => setStrokes((s) => s.slice(0, -1))}>
            Undo
          </button>
          <button type="button" className="btn primary" onClick={() => void exportPng()}>
            Ship It
          </button>
        </div>
      </div>
    </div>
  )
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, _scale: number) {
  const pts = stroke.points
  if (!pts.length) return

  if (stroke.tool === 'spotlight') {
    const p = pts[0]
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(p.x, p.y, stroke.width, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  if (stroke.tool === 'text' && stroke.text) {
    ctx.fillStyle = stroke.color
    ctx.font = '20px Geist, sans-serif'
    ctx.fillText(stroke.text, pts[0].x, pts[0].y)
    return
  }

  if (stroke.tool === 'sticker' && stroke.emoji) {
    ctx.font = '42px sans-serif'
    ctx.fillText(stroke.emoji, pts[0].x, pts[0].y)
    return
  }

  if (stroke.tool === 'rect' || stroke.tool === 'crop') {
    const a = pts[0]
    const b = pts[pts.length - 1]
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    return
  }

  if (stroke.tool === 'arrow' && pts.length >= 2) {
    const a = pts[0]
    const b = pts[pts.length - 1]
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const head = 12
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - head * Math.cos(angle - 0.4), b.y - head * Math.sin(angle - 0.4))
    ctx.lineTo(b.x - head * Math.cos(angle + 0.4), b.y - head * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fill()
    return
  }

  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.stroke()
}
