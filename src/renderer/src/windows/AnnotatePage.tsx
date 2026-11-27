import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnnotatePayload, CaptureRecord } from '../../../shared/types'
import { ANNOTATION_PALETTE } from '../design/tokens'

/**
 * Screenshot annotate window — mirrors AnnotationWindow.swift (screenshotTools):
 * titlebar (title + Copy + Open in Grabbit + Ship It), floating tool pill over the stage,
 * sticker grid, and the right-edge Frame overlay (backgrounds / side-by-side).
 * Ship It = bake + clipboard + close; Frame = presentation panel — not the same door.
 */

/**
 * Screenshot annotate tools.
 * Swift `screenshotTools` is select/spotlight/crop/text/emoji; draw/arrow/rect
 * remain in AnnotationTool and the stroke model — restore them in the pill so
 * the full annotation suite is available (v0.2+ behavior users expect).
 */
type Tool = 'select' | 'spotlight' | 'crop' | 'text' | 'emoji' | 'draw' | 'arrow' | 'rect'
type StrokeTool = Tool
type Background = 'none' | 'warm' | 'cool' | 'midnight'
type SideBySideOrder = 'currentFirst' | 'previousFirst'

interface Point {
  x: number
  y: number
}

/** Coordinates are in natural content pixels (image space), independent of zoom. */
interface Stroke {
  tool: StrokeTool
  color: string
  /** draw/arrow/rect: line width · text: font size · emoji: glyph size (natural px) */
  width: number
  points: Point[]
  text?: string
  emoji?: string
  /** spotlight dim opacity (0–1) */
  dim?: number
}

interface Doc {
  imageUrl: string | null
  strokes: Stroke[]
}

interface SideChoice {
  id: string
  name: string
  url: string
}

const PILL_TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'S' },
  { id: 'draw', label: 'Draw', shortcut: 'D' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R' },
  { id: 'spotlight', label: 'Spotlight', shortcut: 'F' },
  { id: 'crop', label: 'Crop', shortcut: 'C' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'emoji', label: 'Sticker', shortcut: 'E' }
]

const COLORS = [...ANNOTATION_PALETTE]
const STICKERS = [
  '🔥', '✅', '❌', '👀', '💡', '🎯',
  '📎', '🐰', '👍', '👎', '❤️', '⭐',
  '🚀', '⚠️', '💬', '🎉', '🤔', '✨'
]

const BACKGROUNDS: { id: Background; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'midnight', label: 'Midnight' }
]

/* RecordingGradients (tokens.ts) as resolved hex pairs. */
const GRADIENT_STOPS: Record<Exclude<Background, 'none'>, [string, string]> = {
  warm: ['#FFAF66', '#F04E88'],
  cool: ['#33CEED', '#3B66E0'],
  midnight: ['#1E3785', '#171717']
}

const SIDE_GAP = 16
const DEFAULT_DIM = 0.45
const MIN_DRAG = 4

/* ───────────────────────────── Layout + painting ───────────────────────────── */

interface Tile {
  img: HTMLImageElement
  x: number
  y: number
  w: number
  h: number
}

interface Layout {
  /** content size (natural px) */
  cw: number
  ch: number
  pad: number
  radius: number
  /** full canvas size including background padding */
  w: number
  h: number
  tiles: Tile[]
}

function computeLayout(
  img: HTMLImageElement,
  prev: HTMLImageElement | null,
  order: SideBySideOrder,
  bg: Background
): Layout {
  const ch = img.naturalHeight
  const tiles: Tile[] = []
  let cw = img.naturalWidth
  if (prev) {
    const prevW = Math.round(prev.naturalWidth * (ch / prev.naturalHeight))
    cw = img.naturalWidth + SIDE_GAP + prevW
    const cur: Tile = { img, x: 0, y: 0, w: img.naturalWidth, h: ch }
    const other: Tile = { img: prev, x: 0, y: 0, w: prevW, h: ch }
    if (order === 'currentFirst') {
      other.x = img.naturalWidth + SIDE_GAP
      tiles.push(cur, other)
    } else {
      cur.x = prevW + SIDE_GAP
      tiles.push(other, cur)
    }
  } else {
    tiles.push({ img, x: 0, y: 0, w: cw, h: ch })
  }
  const pad = bg === 'none' ? 0 : Math.round(Math.max(cw, ch) * 0.06)
  const radius = bg === 'none' ? 0 : Math.max(6, Math.round(pad * 0.28))
  return { cw, ch, pad, radius, w: cw + pad * 2, h: ch + pad * 2, tiles }
}

function rrectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function rectOf(a: Point, b: Point) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

function textFont(size: number) {
  return `600 ${size}px Geist, -apple-system, BlinkMacSystemFont, sans-serif`
}

function emojiFont(size: number) {
  return `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
}

let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx!
}

function strokeBounds(stroke: Stroke) {
  const pts = stroke.points
  const a = pts[0]
  if (stroke.tool === 'text' && stroke.text) {
    const ctx = getMeasureCtx()
    ctx.font = textFont(stroke.width)
    const lines = stroke.text.split('\n')
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width))
    return { x: a.x, y: a.y, w, h: lines.length * stroke.width * 1.25 }
  }
  if (stroke.tool === 'emoji') {
    return { x: a.x - stroke.width / 2, y: a.y - stroke.width / 2, w: stroke.width, h: stroke.width }
  }
  if (stroke.tool === 'draw') {
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  return rectOf(a, pts[pts.length - 1])
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points
  if (!pts.length) return

  if (stroke.tool === 'text' && stroke.text) {
    ctx.save()
    ctx.fillStyle = stroke.color
    ctx.font = textFont(stroke.width)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    stroke.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, pts[0].x, pts[0].y + i * stroke.width * 1.25)
    })
    ctx.restore()
    return
  }

  if (stroke.tool === 'emoji' && stroke.emoji) {
    ctx.save()
    ctx.font = emojiFont(stroke.width)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(stroke.emoji, pts[0].x, pts[0].y)
    ctx.restore()
    return
  }

  if (stroke.tool === 'rect') {
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
    const head = stroke.width * 5
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - head * Math.cos(angle - 0.4), b.y - head * Math.sin(angle - 0.4))
    ctx.lineTo(b.x - head * Math.cos(angle + 0.4), b.y - head * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fill()
    return
  }

  if (stroke.tool === 'draw') {
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
}

interface PaintOpts {
  layout: Layout
  strokes: Stroke[]
  background: Background
  /** device pixels per natural pixel */
  k: number
  /** editor-only chrome (selection, crop mask) */
  ui: boolean
  draft?: Stroke | null
  selected?: number | null
  cropRect?: { a: Point; b: Point } | null
  scratch?: HTMLCanvasElement
  zoom?: number
}

function paintScene(ctx: CanvasRenderingContext2D, o: PaintOpts) {
  const { layout, k, background } = o
  const canvas = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, 0, 0)

  if (background !== 'none') {
    const [from, to] = GRADIENT_STOPS[background]
    const g = ctx.createLinearGradient(0, 0, layout.w, layout.h)
    g.addColorStop(0, from)
    g.addColorStop(1, to)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, layout.w, layout.h)
  }

  ctx.save()
  ctx.translate(layout.pad, layout.pad)

  for (const t of layout.tiles) {
    if (layout.pad > 0) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.38)'
      ctx.shadowBlur = layout.pad * 0.45 * k
      ctx.shadowOffsetY = layout.pad * 0.12 * k
      ctx.fillStyle = '#000'
      rrectPath(ctx, t.x, t.y, t.w, t.h, layout.radius)
      ctx.fill()
      ctx.restore()
    }
    ctx.save()
    rrectPath(ctx, t.x, t.y, t.w, t.h, layout.radius)
    ctx.clip()
    ctx.drawImage(t.img, t.x, t.y, t.w, t.h)
    ctx.restore()
  }

  const all = o.draft ? [...o.strokes, o.draft] : o.strokes

  /* Spotlights: single dim pass with every region cut out. */
  const spots = all.filter((s) => s.tool === 'spotlight' && s.points.length >= 2)
  if (spots.length && o.scratch) {
    const off = o.scratch
    if (off.width !== canvas.width || off.height !== canvas.height) {
      off.width = canvas.width
      off.height = canvas.height
    }
    const octx = off.getContext('2d')!
    octx.setTransform(1, 0, 0, 1, 0, 0)
    octx.clearRect(0, 0, off.width, off.height)
    octx.setTransform(k, 0, 0, k, layout.pad * k, layout.pad * k)
    const dim = spots[spots.length - 1].dim ?? DEFAULT_DIM
    octx.fillStyle = `rgba(0,0,0,${dim})`
    octx.fillRect(0, 0, layout.cw, layout.ch)
    octx.globalCompositeOperation = 'destination-out'
    octx.fillStyle = '#000'
    for (const s of spots) {
      const r = rectOf(s.points[0], s.points[s.points.length - 1])
      rrectPath(octx, r.x, r.y, r.w, r.h, 6)
      octx.fill()
    }
    octx.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(off, 0, 0)
    ctx.restore()
  }

  for (const s of all) {
    if (s.tool === 'spotlight' || s.tool === 'crop') continue
    drawStroke(ctx, s)
  }

  if (o.ui) {
    const zoom = o.zoom ?? 1
    if (o.selected != null && o.strokes[o.selected]) {
      const b = strokeBounds(o.strokes[o.selected])
      const pad = 4 / zoom
      ctx.save()
      ctx.strokeStyle = '#5080FF'
      ctx.lineWidth = 1.5 / zoom
      ctx.setLineDash([5 / zoom, 3 / zoom])
      ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
      ctx.restore()
    }
    for (const s of spots) {
      const r = rectOf(s.points[0], s.points[s.points.length - 1])
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1 / zoom
      rrectPath(ctx, r.x, r.y, r.w, r.h, 6)
      ctx.stroke()
      ctx.restore()
    }
    if (o.cropRect) {
      const r = rectOf(o.cropRect.a, o.cropRect.b)
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, layout.cw, r.y)
      ctx.fillRect(0, r.y + r.h, layout.cw, layout.ch - r.y - r.h)
      ctx.fillRect(0, r.y, r.x, r.h)
      ctx.fillRect(r.x + r.w, r.y, layout.cw - r.x - r.w, r.h)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / zoom
      ctx.setLineDash([6 / zoom, 4 / zoom])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.restore()
    }
  }
  ctx.restore()
}

function hitTest(strokes: Stroke[], p: Point, tolerance: number): number | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const b = strokeBounds(strokes[i])
    if (
      p.x >= b.x - tolerance &&
      p.x <= b.x + b.w + tolerance &&
      p.y >= b.y - tolerance &&
      p.y <= b.y + b.h + tolerance
    ) {
      return i
    }
  }
  return null
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function baseName(p: string) {
  const file = p.split(/[\\/]/).pop() || ''
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/* ───────────────────────────────── Component ───────────────────────────────── */

export function AnnotatePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)

  const [captureId, setCaptureId] = useState('')
  const [title, setTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')

  const [doc, setDoc] = useState<Doc>({ imageUrl: null, strokes: [] })
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const docRef = useRef(doc)
  docRef.current = doc

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [prevImg, setPrevImg] = useState<HTMLImageElement | null>(null)

  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>(COLORS[0])
  const [dim, setDim] = useState(DEFAULT_DIM)
  const [armedEmoji, setArmedEmoji] = useState<string>(STICKERS[0])
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState<Stroke | null>(null)
  const [cropRect, setCropRect] = useState<{ a: Point; b: Point } | null>(null)
  const [textDraft, setTextDraftState] = useState<{ at: Point; value: string } | null>(null)
  /** Mirrors textDraft so blur/commit handlers never see a stale (already committed) draft. */
  const textDraftRef = useRef<{ at: Point; value: string } | null>(null)
  const setTextDraft = (next: { at: Point; value: string } | null) => {
    textDraftRef.current = next
    setTextDraftState(next)
  }

  const [bg, setBg] = useState<Background>('none')
  const [sideEnabled, setSideEnabled] = useState(false)
  const [sideOrder, setSideOrder] = useState<SideBySideOrder>('currentFirst')
  const [sideChoices, setSideChoices] = useState<SideChoice[] | null>(null)
  const [sideChoiceId, setSideChoiceId] = useState<string | null>(null)
  const [framePanelOpen, setFramePanelOpen] = useState(false)

  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const dragRef = useRef<
    | { kind: 'move'; index: number; last: Point; pushed: boolean }
    | { kind: 'rect'; start: Point }
    | { kind: 'draw' }
    | null
  >(null)

  /* ——— Load payload + image ——— */
  useEffect(() => {
    ;(async () => {
      const p = (await window.grabbit.getRoutePayload()) as AnnotatePayload | null
      if (!p) return
      setCaptureId(p.captureId)
      setTitle(baseName(p.path) || 'Untitled')
      const rec = (await window.grabbit.historyGet(p.captureId)) as CaptureRecord | undefined
      if (rec?.displayName) setTitle(rec.displayName)
      if (p.path) {
        const url = (await window.grabbit.readFileDataUrl(p.path)) as string | null
        const next: Doc = { imageUrl: url, strokes: [] }
        docRef.current = next
        setDoc(next)
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!doc.imageUrl) {
      setImg(null)
      return
    }
    loadImage(doc.imageUrl)
      .then((i) => {
        if (!cancelled) setImg(i)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [doc.imageUrl])

  /* Previous screenshots for side-by-side (loaded lazily when the Frame panel first opens). */
  useEffect(() => {
    if (!framePanelOpen || sideChoices !== null || !captureId) return
    let cancelled = false
    ;(async () => {
      const list = ((await window.grabbit.historyList()) as CaptureRecord[]) ?? []
      const prev = list.filter((c) => c.kind === 'screenshot' && c.id !== captureId).slice(0, 6)
      const choices: SideChoice[] = []
      for (const c of prev) {
        const url = (await window.grabbit.readFileDataUrl(c.thumbnailPath || c.path)) as string | null
        if (url) choices.push({ id: c.id, name: c.displayName || baseName(c.path), url })
      }
      if (!cancelled) setSideChoices(choices)
    })()
    return () => {
      cancelled = true
    }
  }, [framePanelOpen, sideChoices, captureId])

  useEffect(() => {
    const choice = sideChoices?.find((c) => c.id === sideChoiceId)
    if (!sideEnabled || !choice) {
      setPrevImg(null)
      return
    }
    let cancelled = false
    ;(async () => {
      // Use the full-resolution file when we can; thumbnail otherwise.
      const rec = (await window.grabbit.historyGet(choice.id)) as CaptureRecord | undefined
      const full = rec?.path ? ((await window.grabbit.readFileDataUrl(rec.path)) as string | null) : null
      try {
        const i = await loadImage(full || choice.url)
        if (!cancelled) setPrevImg(i)
      } catch {
        if (!cancelled) setPrevImg(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sideEnabled, sideChoiceId, sideChoices])

  /* ——— Stage sizing ——— */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setStageSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const layout = img ? computeLayout(img, sideEnabled ? prevImg : null, sideOrder, bg) : null
  const layoutRef = useRef<Layout | null>(null)
  layoutRef.current = layout

  const availW = Math.max(0, stageSize.w - 48)
  const availH = Math.max(0, stageSize.h - 16 - 88)
  const fit = layout && availW > 0 && availH > 0 ? Math.min(1, availW / layout.w, availH / layout.h) : 1
  const cssW = layout ? Math.round(layout.w * fit) : 0
  const cssH = layout ? Math.round(layout.h * fit) : 0

  /* ——— Paint ——— */
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (!scratchRef.current) scratchRef.current = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    const k = fit * dpr
    const pw = Math.max(1, Math.round(layout.w * k))
    const ph = Math.max(1, Math.round(layout.h * k))
    if (canvas.width !== pw) canvas.width = pw
    if (canvas.height !== ph) canvas.height = ph
    paintScene(ctx, {
      layout,
      strokes: doc.strokes,
      background: bg,
      k: pw / layout.w,
      ui: true,
      draft,
      selected,
      cropRect: tool === 'crop' ? cropRect : null,
      scratch: scratchRef.current,
      zoom: fit
    })
  }, [layout?.w, layout?.h, layout?.pad, img, prevImg, fit, doc.strokes, draft, selected, cropRect, bg, tool, sideEnabled, sideOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ——— History ——— */
  const commit = useCallback((next: Doc) => {
    setPast((p) => [...p.slice(-49), docRef.current])
    setFuture([])
    docRef.current = next
    setDoc(next)
  }, [])

  const replaceLive = useCallback((next: Doc) => {
    docRef.current = next
    setDoc(next)
  }, [])

  const clearTransient = () => {
    setSelected(null)
    setDraft(null)
    setCropRect(null)
    setTextDraft(null)
    dragRef.current = null
  }

  const undo = () => {
    if (!past.length) return
    const prev = past[past.length - 1]
    setPast(past.slice(0, -1))
    setFuture((f) => [docRef.current, ...f])
    docRef.current = prev
    setDoc(prev)
    clearTransient()
  }

  const redo = () => {
    if (!future.length) return
    const next = future[0]
    setFuture(future.slice(1))
    setPast((p) => [...p, docRef.current])
    docRef.current = next
    setDoc(next)
    clearTransient()
  }

  /* ——— Export (flatten) ——— */
  const renderFlattened = (): string | null => {
    const l = layoutRef.current
    if (!l) return null
    const c = document.createElement('canvas')
    c.width = l.w
    c.height = l.h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    paintScene(ctx, {
      layout: l,
      strokes: docRef.current.strokes,
      background: bg,
      k: 1,
      ui: false,
      scratch: document.createElement('canvas')
    })
    return c.toDataURL('image/png')
  }

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }

  /** annotateSave also writes the clipboard in the main process. */
  const flattenSave = async (): Promise<boolean> => {
    if (!captureId) return false
    const dataUrl = renderFlattened()
    if (!dataUrl) return false
    return (await window.grabbit.annotateSave(captureId, dataUrl)) as boolean
  }

  const hasPendingEdits = doc.strokes.length > 0 || bg !== 'none' || (sideEnabled && !!prevImg) || past.length > 0

  const onCopy = async () => {
    const ok = await flattenSave()
    showToast(ok ? 'Copied to clipboard' : 'Couldn’t copy')
  }

  const onOpenInGrabbit = async () => {
    if (hasPendingEdits && !(await flattenSave())) {
      showToast('Couldn’t save')
      return
    }
    await window.grabbit.libraryShow()
    window.close()
  }

  /** Primary CTA: bake annotations, copy to clipboard, close — export / done. */
  const onShipIt = async () => {
    const ok = await flattenSave()
    if (!ok) {
      showToast('Couldn’t ship')
      return
    }
    window.close()
  }

  const onEscape = async () => {
    if (framePanelOpen) {
      setFramePanelOpen(false)
      return
    }
    await flattenSave()
    window.close()
  }

  /* ——— Title rename ——— */
  const beginRename = () => {
    setRenameDraft(title)
    setRenaming(true)
  }

  const commitRename = async () => {
    setRenaming(false)
    const next = renameDraft.trim()
    if (!next || next === title || !captureId) return
    const rec = (await window.grabbit.historyRename(captureId, next)) as CaptureRecord | null
    if (rec) {
      setCaptureId(rec.id)
      setTitle(rec.displayName || next)
    }
  }

  /* ——— Canvas interaction ——— */
  const toContent = (e: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current
    const l = layoutRef.current
    if (!canvas || !l) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * l.w - l.pad,
      y: ((e.clientY - rect.top) / rect.height) * l.h - l.pad
    }
  }

  const strokeColorable = (s: Stroke | undefined) =>
    !!s && (s.tool === 'text' || s.tool === 'draw' || s.tool === 'arrow' || s.tool === 'rect')

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!layout) return
    const p = toContent(e)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (textDraftRef.current) {
      commitText()
    }

    if (tool === 'select') {
      const idx = hitTest(doc.strokes, p, 6 / fit)
      setSelected(idx)
      if (idx != null) dragRef.current = { kind: 'move', index: idx, last: p, pushed: false }
      return
    }

    if (tool === 'text') {
      setTextDraft({ at: p, value: '' })
      return
    }

    if (tool === 'emoji') {
      const stroke: Stroke = {
        tool: 'emoji',
        color,
        width: Math.round(44 / fit),
        points: [p],
        emoji: armedEmoji
      }
      commit({ ...doc, strokes: [...doc.strokes, stroke] })
      setTool('select')
      setSelected(doc.strokes.length)
      return
    }

    if (tool === 'draw') {
      dragRef.current = { kind: 'draw' }
      setDraft({ tool: 'draw', color, width: 4, points: [p] })
      return
    }

    if (tool === 'arrow') {
      dragRef.current = { kind: 'rect', start: p }
      setDraft({ tool: 'arrow', color, width: 3, points: [p, p] })
      return
    }

    if (tool === 'rect') {
      dragRef.current = { kind: 'rect', start: p }
      setDraft({ tool: 'rect', color, width: 2, points: [p, p] })
      return
    }

    if (tool === 'spotlight') {
      dragRef.current = { kind: 'rect', start: p }
      setDraft({ tool: 'spotlight', color, width: 0, points: [p, p], dim })
      return
    }

    if (tool === 'crop') {
      dragRef.current = { kind: 'rect', start: p }
      setCropRect({ a: p, b: p })
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const p = toContent(e)
    if (drag.kind === 'move') {
      const dx = p.x - drag.last.x
      const dy = p.y - drag.last.y
      if (!drag.pushed) {
        if (Math.abs(dx) + Math.abs(dy) < 1) return
        setPast((h) => [...h.slice(-49), docRef.current])
        setFuture([])
        drag.pushed = true
      }
      drag.last = p
      const strokes = docRef.current.strokes.map((s, i) =>
        i === drag.index ? { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : s
      )
      replaceLive({ ...docRef.current, strokes })
      return
    }
    if (drag.kind === 'draw') {
      setDraft((d) => (d ? { ...d, points: [...d.points, p] } : d))
      return
    }
    if (drag.kind !== 'rect') return
    if (tool === 'spotlight' || tool === 'arrow' || tool === 'rect') {
      setDraft((d) => (d ? { ...d, points: [drag.start, p] } : d))
    } else if (tool === 'crop') {
      setCropRect({ a: drag.start, b: p })
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'draw' && draft) {
      setDraft(null)
      if (draft.points.length >= 2) {
        commit({ ...doc, strokes: [...doc.strokes, draft] })
        setSelected(doc.strokes.length)
      }
      return
    }
    if (drag.kind === 'rect' && (tool === 'spotlight' || tool === 'arrow' || tool === 'rect') && draft) {
      const r = rectOf(draft.points[0], draft.points[1])
      setDraft(null)
      const ok =
        tool === 'arrow'
          ? Math.hypot(draft.points[1].x - draft.points[0].x, draft.points[1].y - draft.points[0].y) >= MIN_DRAG
          : r.w >= MIN_DRAG && r.h >= MIN_DRAG
      if (ok) {
        commit({ ...doc, strokes: [...doc.strokes, draft] })
        setSelected(doc.strokes.length)
      }
      return
    }
    if (drag.kind === 'rect' && tool === 'crop' && cropRect) {
      const r = rectOf(cropRect.a, cropRect.b)
      if (r.w < MIN_DRAG || r.h < MIN_DRAG) setCropRect(null)
    }
  }

  const commitText = () => {
    const td = textDraftRef.current
    setTextDraft(null)
    if (!td || !td.value.trim()) return
    const stroke: Stroke = {
      tool: 'text',
      color,
      width: Math.round(20 / fit),
      points: [td.at],
      text: td.value
    }
    commit({ ...docRef.current, strokes: [...docRef.current.strokes, stroke] })
    setSelected(docRef.current.strokes.length - 1)
  }

  const applyCrop = async () => {
    const l = layoutRef.current
    if (!cropRect || !l || !img) return
    const r = rectOf(cropRect.a, cropRect.b)
    const x = Math.max(0, Math.round(r.x))
    const y = Math.max(0, Math.round(r.y))
    const w = Math.min(l.cw - x, Math.round(r.w))
    const h = Math.min(l.ch - y, Math.round(r.h))
    if (w < MIN_DRAG || h < MIN_DRAG) return
    // Bake annotations + side-by-side into the cropped image (no background chrome).
    const flat = computeLayout(img, sideEnabled ? prevImg : null, sideOrder, 'none')
    const full = document.createElement('canvas')
    full.width = flat.w
    full.height = flat.h
    const fctx = full.getContext('2d')
    if (!fctx) return
    paintScene(fctx, {
      layout: flat,
      strokes: docRef.current.strokes,
      background: 'none',
      k: 1,
      ui: false,
      scratch: document.createElement('canvas')
    })
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    tctx.drawImage(full, x, y, w, h, 0, 0, w, h)
    setSideEnabled(false)
    commit({ imageUrl: tmp.toDataURL('image/png'), strokes: [] })
    clearTransient()
    setTool('select')
  }

  /* ——— Toolbar state ——— */
  const selectedStroke = selected != null ? doc.strokes[selected] : undefined
  const showsSpotlightOptions = tool === 'spotlight' || (tool === 'select' && selectedStroke?.tool === 'spotlight')
  const showsColor =
    !showsSpotlightOptions &&
    (tool === 'text' ||
      tool === 'draw' ||
      tool === 'arrow' ||
      tool === 'rect' ||
      (tool === 'select' && strokeColorable(selectedStroke)))
  const showsCropActions = tool === 'crop'

  const pickColor = (c: string) => {
    setColor(c)
    if (selected != null && strokeColorable(doc.strokes[selected])) {
      commit({
        ...doc,
        strokes: doc.strokes.map((s, i) => (i === selected ? { ...s, color: c } : s))
      })
    }
  }

  const changeDim = (v: number) => {
    setDim(v)
    if (selected != null && doc.strokes[selected]?.tool === 'spotlight') {
      replaceLive({
        ...doc,
        strokes: doc.strokes.map((s, i) => (i === selected ? { ...s, dim: v } : s))
      })
    }
  }

  const chooseTool = (t: Tool) => {
    setTool(t)
    setDraft(null)
    setTextDraft(null)
    if (t !== 'crop') setCropRect(null)
    if (t !== 'select') setSelected(null)
  }

  /* ——— Keyboard ——— */
  const actions = useRef({
    undo,
    redo,
    onEscape,
    applyCrop,
    chooseTool,
    deleteSelected: () => {}
  })
  actions.current = {
    undo,
    redo,
    onEscape,
    applyCrop,
    chooseTool,
    deleteSelected: () => {
      if (selected == null) return
      commit({ ...doc, strokes: doc.strokes.filter((_, i) => i !== selected) })
      setSelected(null)
    }
  }
  const toolRef = useRef(tool)
  toolRef.current = tool

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) actions.current.redo()
        else actions.current.undo()
        return
      }
      if (typing) return
      const key = e.key.toLowerCase()
      const toolByKey: Record<string, Tool> = {
        s: 'select',
        d: 'draw',
        a: 'arrow',
        r: 'rect',
        f: 'spotlight',
        c: 'crop',
        t: 'text',
        e: 'emoji'
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && toolByKey[key]) {
        e.preventDefault()
        actions.current.chooseTool(toolByKey[key])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        void actions.current.onEscape()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actions.current.deleteSelected()
      } else if (e.key === 'Enter' && toolRef.current === 'crop') {
        e.preventDefault()
        void actions.current.applyCrop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ——— Frame panel helpers ——— */
  const toggleSideBySide = () => {
    if (sideEnabled) {
      setSideEnabled(false)
      return
    }
    if (!sideChoices?.length) return
    if (!sideChoiceId) setSideChoiceId(sideChoices[0].id)
    setSideEnabled(true)
  }

  const textFontPx = 20
  const canvasCursor =
    tool === 'select'
      ? 'default'
      : tool === 'text'
        ? 'text'
        : tool === 'emoji'
          ? 'copy'
          : tool === 'draw'
            ? 'crosshair'
            : 'crosshair'

  return (
    <div className="app-surface annotate-page">
      {/* Titlebar: drag region + title + Copy / Open in Grabbit */}
      <div className="annotate-titlebar titlebar-drag">
        <div className="annotate-titlebar__title titlebar-no-drag">
          {renaming ? (
            <input
              className="annotate-titlebar__input"
              autoFocus
              spellCheck={false}
              value={renameDraft}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setRenameDraft(title)
                  setRenaming(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="annotate-titlebar__name"
              title="Rename"
              onClick={beginRename}
            >
              {title || 'Untitled'}
            </button>
          )}
        </div>
        <div className="annotate-titlebar__actions titlebar-no-drag">
          <button
            type="button"
            className="annotate-icon-btn"
            title="Copy"
            onClick={() => void onCopy()}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1.5" />
              <path d="M9.5 2.8V2.5A1.5 1.5 0 0 0 8 1H3A1.5 1.5 0 0 0 1.5 2.5V8A1.5 1.5 0 0 0 3 9.5h.3" />
            </svg>
          </button>
          <button type="button" className="annotate-text-btn" onClick={() => void onOpenInGrabbit()}>
            Open in Grabbit
          </button>
          <button
            type="button"
            className="btn compact primary annotate-ship"
            title="Bake, copy, and close"
            onClick={() => void onShipIt()}
          >
            Ship It
          </button>
        </div>
      </div>

      {/* Stage — toolbar pill, sticker panel and Frame panel float above it */}
      <div className="annotate-stage-host">
        <div className="annotate-stage" ref={stageRef}>
          {layout ? (
            <div className="annotate-canvas-host" style={{ width: cssW, height: cssH }}>
              <canvas
                ref={canvasRef}
                className="annotate-canvas"
                style={{ width: cssW, height: cssH, cursor: canvasCursor }}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {textDraft ? (
                <input
                  className="annotate-text-input"
                  autoFocus
                  spellCheck={false}
                  placeholder="Type…"
                  value={textDraft.value}
                  style={{
                    left: (textDraft.at.x + layout.pad) * fit,
                    top: (textDraft.at.y + layout.pad) * fit,
                    fontSize: textFontPx,
                    color
                  }}
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  onBlur={commitText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitText()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setTextDraft(null)
                    }
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="annotate-empty">Loading…</div>
          )}
        </div>

        {toast ? <div className="annotate-toast">{toast}</div> : null}

        {tool === 'emoji' ? (
          <div className="annotate-stickers titlebar-no-drag" role="listbox" aria-label="Stickers">
            {STICKERS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`annotate-stickers__cell ${armedEmoji === emoji ? 'is-selected' : ''}`}
                onClick={() => setArmedEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
            <div className="annotate-stickers__hint">Click the image to place</div>
          </div>
        ) : null}

        <div className="annotate-pill titlebar-no-drag">
          {PILL_TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`annotate-pill__btn ${tool === t.id ? 'is-active' : ''}`}
              title={`${t.label} (${t.shortcut})`}
              aria-pressed={tool === t.id}
              onClick={() => chooseTool(t.id)}
            >
              <ToolGlyph tool={t.id} />
            </button>
          ))}

          {showsColor ? (
            <>
              <span className="annotate-pill__sep" />
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`annotate-pill__color ${
                    (selectedStroke && strokeColorable(selectedStroke) ? selectedStroke.color : color) === c
                      ? 'is-selected'
                      : ''
                  }`}
                  style={{ background: c }}
                  title="Color"
                  onClick={() => pickColor(c)}
                />
              ))}
            </>
          ) : null}

          {showsSpotlightOptions ? (
            <>
              <span className="annotate-pill__sep" />
              <label className="annotate-pill__option" title="Dim outside the spotlight">
                <span>Dim</span>
                <input
                  type="range"
                  min={0.1}
                  max={0.85}
                  step={0.05}
                  value={selectedStroke?.tool === 'spotlight' ? (selectedStroke.dim ?? dim) : dim}
                  onChange={(e) => changeDim(Number(e.target.value))}
                />
              </label>
            </>
          ) : null}

          {showsCropActions ? (
            <>
              <span className="annotate-pill__sep" />
              <button
                type="button"
                className="annotate-pill__text"
                disabled={!cropRect}
                onClick={() => setCropRect(null)}
              >
                Reset
              </button>
              <button
                type="button"
                className="annotate-pill__text is-primary"
                disabled={!cropRect}
                onClick={() => void applyCrop()}
              >
                Apply
              </button>
            </>
          ) : null}

          <span className="annotate-pill__sep" />
          <button
            type="button"
            className="annotate-pill__btn"
            title="Undo (⌘Z)"
            disabled={!past.length}
            onClick={undo}
          >
            ↶
          </button>
          <button
            type="button"
            className="annotate-pill__btn"
            title="Redo (⇧⌘Z)"
            disabled={!future.length}
            onClick={redo}
          >
            ↷
          </button>
          <button
            type="button"
            className={`annotate-pill__btn ${framePanelOpen ? 'is-active' : ''}`}
            title="Frame"
            aria-label="Frame"
            aria-pressed={framePanelOpen}
            onClick={() => setFramePanelOpen((v) => !v)}
          >
            ···
          </button>
        </div>

        {framePanelOpen ? (
          <aside className="annotate-more titlebar-no-drag" aria-label="Frame">
            <div className="annotate-more__header">
              <span className="annotate-more__title">Frame</span>
              <button
                type="button"
                className="annotate-icon-btn"
                title="Close"
                onClick={() => setFramePanelOpen(false)}
              >
                ›
              </button>
            </div>

            <div className="annotate-more__label">Background</div>
            <div className="annotate-more__swatches">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  title={b.label}
                  className={`annotate-swatch annotate-swatch--${b.id} ${bg === b.id ? 'is-selected' : ''}`}
                  onClick={() => setBg(b.id)}
                />
              ))}
            </div>

            <div className="annotate-more__row">
              <span className="annotate-more__label">Side by Side</span>
              <button
                type="button"
                role="switch"
                aria-checked={sideEnabled}
                className={`annotate-switch ${sideEnabled ? 'is-on' : ''}`}
                disabled={sideChoices !== null && sideChoices.length === 0}
                onClick={toggleSideBySide}
              >
                <span />
              </button>
            </div>

            {sideChoices === null ? (
              <div className="annotate-more__empty">Loading…</div>
            ) : sideChoices.length === 0 ? (
              <div className="annotate-more__empty">No previous screenshots</div>
            ) : (
              <>
                <div className="annotate-more__tiles">
                  {sideChoices.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      className={`annotate-tile ${sideChoiceId === c.id ? 'is-selected' : ''}`}
                      style={{ backgroundImage: `url(${c.url})` }}
                      onClick={() => {
                        setSideChoiceId(c.id)
                        setSideEnabled(true)
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="btn compact"
                  disabled={!sideEnabled}
                  onClick={() => setSideOrder((o) => (o === 'currentFirst' ? 'previousFirst' : 'currentFirst'))}
                >
                  Swap Order
                </button>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function ToolGlyph({ tool }: { tool: Tool }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  switch (tool) {
    case 'select':
      return (
        <svg {...common}>
          <path d="M3.5 2.5l3.2 9.2 1.4-3.4 3.4-1.4L3.5 2.5z" />
        </svg>
      )
    case 'draw':
      return (
        <svg {...common}>
          <path d="M3 11c2-3 4-5 5.5-5.5S12 6 13 9" />
          <path d="M10.5 4.5l1.5 1.5" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M4 12L12 4" />
          <path d="M7 4h5v5" />
        </svg>
      )
    case 'rect':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="9" height="7" rx="1" />
        </svg>
      )
    case 'spotlight':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" strokeDasharray="2 1.5" />
          <path d="M6 8h4M8 6v4" />
        </svg>
      )
    case 'crop':
      return (
        <svg {...common}>
          <path d="M5 2v9h9" />
          <path d="M11 14V5H2" />
        </svg>
      )
    case 'text':
      return (
        <svg {...common}>
          <path d="M3.5 4.5h9" />
          <path d="M8 4.5v7" />
          <path d="M5.5 11.5h5" />
        </svg>
      )
    case 'emoji':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" />
          <path d="M5.8 7h.1M10.1 7h.1M5.8 9.5c.8 1 2.2 1 3.2 0" />
        </svg>
      )
  }
}
